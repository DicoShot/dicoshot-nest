import { DicoshotClientImpl } from './dicoshot.client.impl';

// 실제 Discord로 요청을 보내지 않는 가짜 URL
const URL_ = 'https://discord.test/api/webhooks/0/fake-token';
const MESSAGE = { content: 'hi' };

function res(status: number, body = '', headers: Record<string, string> = {}): Response {
  return new Response(body || null, { status, headers });
}

describe('DicoshotClientImpl 재시도 정책', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.useRealTimers();
    fetchMock.mockRestore();
  });

  /** 가짜 타이머를 돌리며 sendTo의 결과(성공/실패)를 받는다 */
  async function run(client: DicoshotClientImpl): Promise<unknown> {
    let outcome: unknown = 'ok';
    const p = client.sendTo(URL_, MESSAGE).catch((e: unknown) => {
      outcome = e;
    });
    await jest.advanceTimersByTimeAsync(120_000);
    await p;
    return outcome;
  }

  it('retry 옵션이 없으면 기본으로 재시도한다(최초 1회 + 2회)', async () => {
    fetchMock.mockResolvedValue(res(503));
    const outcome = await run(new DicoshotClientImpl({}));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((outcome as Error).message).toContain('503');
  });

  it('retry: false면 재시도하지 않는다', async () => {
    fetchMock.mockResolvedValue(res(503));
    await run(new DicoshotClientImpl({ retry: false }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('5xx 후 성공하면 성공으로 끝난다', async () => {
    fetchMock.mockResolvedValueOnce(res(500)).mockResolvedValueOnce(res(204));
    const outcome = await run(new DicoshotClientImpl({}));

    expect(outcome).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('네트워크 오류는 재시도한다', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(res(204));
    const outcome = await run(new DicoshotClientImpl({}));

    expect(outcome).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404])('%i는 재시도하지 않고 즉시 실패한다', async (status) => {
    fetchMock.mockResolvedValue(res(status, '{"message":"Unknown Webhook","code":10015}'));
    const outcome = (await run(new DicoshotClientImpl({}))) as Error;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome.message).toContain(String(status));
    expect(outcome.message).toContain('Unknown Webhook');
  });

  it('429는 재시도한다', async () => {
    fetchMock.mockResolvedValueOnce(res(429)).mockResolvedValueOnce(res(204));
    expect(await run(new DicoshotClientImpl({}))).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  describe('Retry-After', () => {
    async function firstRetryDelay(headers: Record<string, string>, options = {}): Promise<number> {
      fetchMock.mockResolvedValueOnce(res(429, '', headers)).mockResolvedValue(res(204));
      const p = new DicoshotClientImpl(options).sendTo(URL_, MESSAGE);
      await jest.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // 대기 시간을 이진 탐색 없이, 알려진 경계에서 두 번 확인한다
      let waited = 0;
      while (fetchMock.mock.calls.length < 2 && waited < 60_000) {
        await jest.advanceTimersByTimeAsync(100);
        waited += 100;
      }
      await jest.advanceTimersByTimeAsync(120_000);
      await p;
      return waited;
    }

    it('소수 초 값을 따른다', async () => {
      const waited = await firstRetryDelay({ 'retry-after': '1.5' });
      expect(waited).toBeGreaterThanOrEqual(1500);
      expect(waited).toBeLessThan(1700);
    });

    it('숫자가 아닌 값(HTTP 날짜)이면 즉시 재시도하지 않고 백오프를 쓴다', async () => {
      const waited = await firstRetryDelay({ 'retry-after': 'Thu, 21 Oct 2026 07:28:00 GMT' });
      expect(waited).toBeGreaterThanOrEqual(500);
      expect(waited).toBeLessThan(700);
    });

    it('큰 값은 30초로 제한한다', async () => {
      const waited = await firstRetryDelay({ 'retry-after': '99999' });
      expect(waited).toBeGreaterThanOrEqual(30_000);
      expect(waited).toBeLessThan(30_200);
    });

    it('헤더가 없으면 backoffMs를 쓴다', async () => {
      const waited = await firstRetryDelay({}, { retry: { backoffMs: 1000 } });
      expect(waited).toBeGreaterThanOrEqual(1000);
      expect(waited).toBeLessThan(1200);
    });
  });

  it('최종 실패 메시지에 웹훅 URL이 들어가지 않는다', async () => {
    fetchMock.mockRejectedValue(new TypeError(`failed to fetch ${URL_}`));
    const outcome = (await run(new DicoshotClientImpl({}))) as Error;

    expect(outcome.message).not.toContain('fake-token');
    expect(outcome.message).toContain('[webhook]');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('응답 본문 일부가 오류 메시지에 포함되고 200자로 제한된다', async () => {
    fetchMock.mockResolvedValue(res(400, 'x'.repeat(1000)));
    const outcome = (await run(new DicoshotClientImpl({}))) as Error;

    expect(outcome.message.length).toBeLessThan(260);
  });

  it('retry 옵션 객체의 attempts를 따른다', async () => {
    fetchMock.mockResolvedValue(res(500));
    await run(new DicoshotClientImpl({ retry: { attempts: 4, backoffMs: 10 } }));

    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
