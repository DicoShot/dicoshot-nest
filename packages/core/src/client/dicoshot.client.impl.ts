import { DiscordMessage } from '../message/discord.message';
import { fitMessage } from '../message/embed.util';
import { DicoshotOptions, RetryOptions } from '../options/dicoshot.options';
import { DicoshotClient } from './dicoshot.client';

const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF_MS = 500;
/** Retry-After나 백오프가 아무리 커도 이 이상 붙잡히지 않는다 */
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_ERROR_BODY_LENGTH = 200;

/** 재시도해 볼 만한 일시적 오류: 429(속도 제한)와 5xx. 그 밖의 4xx는 다시 보내도 같은 결과다. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** 숫자(초, 소수 허용)만 받는다. HTTP 날짜 같은 값은 undefined로 돌려 백오프를 쓰게 한다. */
function parseRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  return Math.min(Number(trimmed) * 1000, MAX_RETRY_DELAY_MS);
}

export class DicoshotClientImpl implements DicoshotClient {
  constructor(private readonly options: DicoshotOptions) {}

  async send(message: DiscordMessage): Promise<void> {
    if (!this.options.webhookUrl) return;
    await this.sendTo(this.options.webhookUrl, message);
  }

  async sendTo(url: string, message: DiscordMessage): Promise<void> {
    const { attempts, backoffMs } = this.resolveRetry();
    // 어떤 경로로 만든 메시지든 Discord 한도를 넘어 400으로 유실되지 않게 마지막으로 보정한다
    const body = JSON.stringify(fitMessage(message));

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
        });
      } catch (err) {
        if (attempt >= attempts) {
          throw new Error(`Discord webhook request failed: ${this.describeError(err, url)}`);
        }
        await this.delay(this.backoff(backoffMs, attempt));
        continue;
      }

      if (response.ok) {
        void response.body?.cancel().catch(() => undefined);
        return;
      }

      if (!isRetryableStatus(response.status) || attempt >= attempts) {
        // 웹훅 URL은 로그에 남지 않도록 상태 코드와 응답 본문 일부만 메시지에 담는다
        throw new Error(
          `Discord webhook responded with ${response.status}${await this.readBodySnippet(response, url)}`,
        );
      }
      void response.body?.cancel().catch(() => undefined);
      // Discord가 429와 함께 보내는 Retry-After를 우선 따르고, 없거나 숫자가 아니면 지수 백오프를 사용한다
      const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
      await this.delay(retryAfter ?? this.backoff(backoffMs, attempt));
    }
  }

  private resolveRetry(): { attempts: number; backoffMs: number } {
    const retry = this.options.retry;
    // 기본값은 켜짐: 장애 알림이 순간적인 네트워크 불안정에 사라지지 않게 한다. 끄려면 retry: false
    if (retry === false) return { attempts: 0, backoffMs: DEFAULT_RETRY_BACKOFF_MS };
    if (retry === undefined || retry === true) {
      return { attempts: DEFAULT_RETRY_ATTEMPTS, backoffMs: DEFAULT_RETRY_BACKOFF_MS };
    }
    return this.resolveRetryOptions(retry);
  }

  private resolveRetryOptions(retry: RetryOptions): { attempts: number; backoffMs: number } {
    return {
      attempts: Math.max(0, retry.attempts ?? DEFAULT_RETRY_ATTEMPTS),
      backoffMs: Math.max(0, retry.backoffMs ?? DEFAULT_RETRY_BACKOFF_MS),
    };
  }

  private backoff(backoffMs: number, attempt: number): number {
    return Math.min(backoffMs * 2 ** attempt, MAX_RETRY_DELAY_MS);
  }

  private async readBodySnippet(response: Response, url: string): Promise<string> {
    try {
      const text = (await response.text()).trim();
      if (!text) return '';
      return `: ${this.redactUrl(text, url).slice(0, MAX_ERROR_BODY_LENGTH)}`;
    } catch {
      return '';
    }
  }

  private describeError(err: unknown, url: string): string {
    if (!(err instanceof Error)) return 'unknown error';
    const cause = (err as Error & { cause?: { code?: string } }).cause;
    const detail = cause?.code ? `${err.message} (${cause.code})` : err.message;
    return this.redactUrl(detail, url);
  }

  private redactUrl(text: string, url: string): string {
    return text.split(url).join('[webhook]');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
