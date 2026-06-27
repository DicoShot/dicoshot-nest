import { DiscordMessage } from '../message/discord.message';
import { DicoshotOptions, RetryOptions } from '../options/dicoshot.options';
import { DicoshotClient } from './dicoshot.client';

const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF_MS = 500;

export class DicoshotClientImpl implements DicoshotClient {
  constructor(private readonly options: DicoshotOptions) {}

  async send(message: DiscordMessage): Promise<void> {
    if (!this.options.webhookUrl) return;
    await this.sendTo(this.options.webhookUrl, message);
  }

  async sendTo(url: string, message: DiscordMessage): Promise<void> {
    const { attempts, backoffMs } = this.resolveRetry();

    for (let attempt = 0; ; attempt++) {
      let response: Response | undefined;
      try {
        response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(message),
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
        });
      } catch (err) {
        if (attempt >= attempts) throw err;
        await this.delay(backoffMs * 2 ** attempt);
        continue;
      }

      if (response.ok) return;

      if (attempt >= attempts) {
        throw new Error(`Discord webhook responded with ${response.status}`);
      }
      // Discord가 429와 함께 보내는 Retry-After를 우선 따르고, 없으면 지수 백오프를 사용한다
      await this.delay(this.resolveDelay(response, backoffMs, attempt));
    }
  }

  private resolveRetry(): { attempts: number; backoffMs: number } {
    const retry = this.options.retry;
    if (!retry) return { attempts: 0, backoffMs: DEFAULT_RETRY_BACKOFF_MS };
    if (retry === true) {
      return { attempts: DEFAULT_RETRY_ATTEMPTS, backoffMs: DEFAULT_RETRY_BACKOFF_MS };
    }
    return this.resolveRetryOptions(retry);
  }

  private resolveRetryOptions(retry: RetryOptions): { attempts: number; backoffMs: number } {
    return {
      attempts: retry.attempts ?? DEFAULT_RETRY_ATTEMPTS,
      backoffMs: retry.backoffMs ?? DEFAULT_RETRY_BACKOFF_MS,
    };
  }

  private resolveDelay(response: Response, backoffMs: number, attempt: number): number {
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) return Number(retryAfter) * 1000;
    }
    return backoffMs * 2 ** attempt;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
