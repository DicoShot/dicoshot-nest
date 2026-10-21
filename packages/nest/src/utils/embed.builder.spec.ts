import type { DiscordEmbed } from 'dicoshot-core';
import { EMBED_LIMITS, getMessages } from 'dicoshot-core';

import { buildErrorEmbed, buildSlowEmbed } from './embed.builder';

const msg = getMessages('en');

function totalLength(embed: DiscordEmbed): number {
  return (
    (embed.title?.length ?? 0) +
    (embed.description?.length ?? 0) +
    (embed.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0)
  );
}

function expectWithinLimits(embed: DiscordEmbed): void {
  expect(embed.title?.length ?? 0).toBeLessThanOrEqual(EMBED_LIMITS.title);
  expect(embed.description?.length ?? 0).toBeLessThanOrEqual(EMBED_LIMITS.description);
  expect(embed.fields?.length ?? 0).toBeLessThanOrEqual(EMBED_LIMITS.fields);
  for (const f of embed.fields ?? []) {
    expect(f.name.length).toBeLessThanOrEqual(EMBED_LIMITS.fieldName);
    expect(f.value.length).toBeLessThanOrEqual(EMBED_LIMITS.fieldValue);
  }
  expect(totalLength(embed)).toBeLessThanOrEqual(EMBED_LIMITS.total);
}

function input(error: unknown, extra: object = {}) {
  return {
    msg,
    env: 'production',
    appName: 'app',
    error,
    method: 'GET',
    path: '/x',
    status: 500,
    includeStack: true,
    includeRequest: true,
    ...extra,
  };
}

describe('buildErrorEmbed', () => {
  it('짧은 알림의 모양은 그대로다', () => {
    const err = new Error('boom');
    const embed = buildErrorEmbed(input(err, { body: { a: 1 } }));

    expect(embed.title).toBe('🚨 [production] app — Error');
    expect(embed.description).toBe('`boom`');
    expect(embed.fields?.map((f) => f.name)).toEqual([
      msg.field.service,
      msg.field.environment,
      msg.field.status,
      msg.field.method,
      msg.field.path,
      msg.field.location,
      msg.field.requestBody,
      msg.field.stackTrace,
    ]);
    expect(embed.fields?.find((f) => f.name === msg.field.requestBody)?.value).toBe(
      '```json\n{"a":1}\n```',
    );
  });

  it('5000자 메시지가 한도 안으로 잘린다', () => {
    const embed = buildErrorEmbed(input(new Error('m'.repeat(5000))));
    expectWithinLimits(embed);
    expect(embed.description?.startsWith('`')).toBe(true);
    expect(embed.description?.endsWith('`')).toBe(true);
  });

  it('2000자 경로가 필드 한도로 잘린다', () => {
    const embed = buildErrorEmbed(input(new Error('x'), { path: '/' + 'p'.repeat(2000) }));
    expectWithinLimits(embed);
    expect(embed.fields?.find((f) => f.name === msg.field.path)?.value).toHaveLength(
      EMBED_LIMITS.fieldValue,
    );
  });

  it('합계 6000자 초과 조합(메시지 3500 + 경로 1000 + 스택 + 본문)도 한도 안이며 메시지가 보존된다', () => {
    const err = new Error('m'.repeat(3500));
    err.stack = `Error: x\n${'    at fn (/app/src/file.ts:1:1)\n'.repeat(100)}`;
    const embed = buildErrorEmbed(
      input(err, { path: '/' + 'p'.repeat(1000), body: { big: 'b'.repeat(2000) } }),
    );
    expectWithinLimits(embed);
    expect(embed.description).toHaveLength(3502);
    expect(embed.fields?.find((f) => f.name === msg.field.path)?.value).toHaveLength(1001);
  });

  it('백틱이 든 메시지도 코드 스팬이 깨지지 않는다', () => {
    const embed = buildErrorEmbed(input(new Error('query `users` failed')));
    expect(embed.description?.match(/`/g)).toHaveLength(2);
  });

  it('includeStack/includeRequest를 끄면 해당 필드가 빠진다', () => {
    const embed = buildErrorEmbed(
      input(new Error('x'), { includeStack: false, includeRequest: false, body: { a: 1 } }),
    );
    const names = embed.fields?.map((f) => f.name);
    expect(names).not.toContain(msg.field.stackTrace);
    expect(names).not.toContain(msg.field.requestBody);
  });
});

describe('buildSlowEmbed', () => {
  it('긴 경로도 한도 안으로 자른다', () => {
    const embed = buildSlowEmbed({
      msg,
      env: 'production',
      appName: 'app',
      method: 'GET',
      path: '/' + 'p'.repeat(3000),
      durationMs: 4000,
    });
    expectWithinLimits(embed);
  });
});
