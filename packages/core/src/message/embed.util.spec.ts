import { DiscordEmbed } from './discord.message';
import { codeBlock, codeSpan, EMBED_LIMITS, fitEmbed, fitMessage, truncate } from './embed.util';

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

describe('truncate', () => {
  it('한도 이내면 그대로 둔다', () => {
    expect(truncate('abc', 3)).toBe('abc');
  });

  it('넘으면 한도 길이로 자르고 …를 붙인다', () => {
    const out = truncate('a'.repeat(50), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith('…')).toBe(true);
  });

  it('서로게이트 쌍을 깨뜨리지 않는다', () => {
    const out = truncate('😀'.repeat(10), 5);
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out).not.toMatch(/[\ud800-\udbff]…$/);
  });

  it('코드 블록은 감싸는 기호를 유지한 채 안쪽만 자른다', () => {
    const out = truncate(codeBlock('x'.repeat(2000), 'json'), 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.startsWith('```json\n')).toBe(true);
    expect(out.endsWith('\n```')).toBe(true);
  });

  it('코드 스팬은 닫는 백틱을 유지한다', () => {
    const out = truncate(codeSpan('y'.repeat(500)), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.startsWith('`')).toBe(true);
    expect(out.endsWith('`')).toBe(true);
  });

  it('자르다가 코드 블록이 열린 채 남으면 닫는다', () => {
    const out = truncate('```\n' + 'z'.repeat(500) + '\n```\n뒤에 붙은 글', 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.split('```').length - 1).toBe(2);
  });
});

describe('codeSpan / codeBlock', () => {
  it('백틱이 든 텍스트도 감싸는 기호를 깨뜨리지 않는다', () => {
    const span = codeSpan('SELECT `id` FROM t');
    expect(span.match(/`/g)).toHaveLength(2);

    const block = codeBlock('```evil```');
    expect(block.match(/```/g)).toHaveLength(2);
  });
});

describe('fitEmbed', () => {
  it('한도 이내의 짧은 임베드는 모양이 그대로다', () => {
    const embed: DiscordEmbed = {
      title: '제목',
      description: '`설명`',
      color: 1,
      fields: [{ name: 'a', value: 'b', inline: true }],
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    expect(fitEmbed(embed)).toEqual(embed);
  });

  it('5000자 description, 2000자 필드 값, 300자 제목을 각 한도로 자른다', () => {
    const out = fitEmbed({
      title: 't'.repeat(300),
      description: 'd'.repeat(5000),
      fields: [{ name: 'n'.repeat(300), value: 'v'.repeat(2000) }],
    });
    expect(out.title).toHaveLength(EMBED_LIMITS.title);
    expect(out.fields?.[0].name).toHaveLength(EMBED_LIMITS.fieldName);
    expect(out.fields?.[0].value).toHaveLength(EMBED_LIMITS.fieldValue);
    expectWithinLimits(out);
  });

  it('필드가 25개를 넘으면 낮은 우선순위부터 뺀다', () => {
    const fields = Array.from({ length: 30 }, (_, i) => ({ name: `f${i}`, value: 'v' }));
    const out = fitEmbed({ fields }, { fieldPriorities: fields.map((_, i) => i) });
    expect(out.fields).toHaveLength(EMBED_LIMITS.fields);
    expect(out.fields?.[0].name).toBe('f5');
  });

  it('합계 6000자를 넘으면 우선순위가 낮은 필드부터 줄인다', () => {
    const out = fitEmbed(
      {
        title: 'T',
        description: 'd'.repeat(3500),
        fields: [
          { name: 'path', value: 'p'.repeat(1000) },
          { name: 'stack', value: 's'.repeat(1000) },
          { name: 'body', value: 'b'.repeat(1000) },
        ],
      },
      { fieldPriorities: [50, 20, 10] },
    );
    expectWithinLimits(out);
    const byName = Object.fromEntries((out.fields ?? []).map((f) => [f.name, f.value]));
    expect(byName['path']).toHaveLength(1000);
    expect(out.description).toHaveLength(3500);
    expect(byName['body']?.length ?? 0).toBeLessThan(byName['stack']?.length ?? 0);
  });

  it('최악 조합(긴 메시지·경로·스택·본문)도 한도 안에 들어온다', () => {
    const out = fitEmbed(
      {
        title: 't'.repeat(256),
        description: 'd'.repeat(4096),
        fields: Array.from({ length: 25 }, (_, i) => ({ name: `n${i}`, value: 'v'.repeat(1024) })),
      },
      { fieldPriorities: Array.from({ length: 25 }, (_, i) => i) },
    );
    expectWithinLimits(out);
  });
});

describe('fitMessage', () => {
  it('content를 2000자로, 모든 임베드를 한도 안으로 만든다', () => {
    const out = fitMessage({
      content: 'c'.repeat(3000),
      embeds: [{ description: 'd'.repeat(5000) }],
    });
    expect(out.content).toHaveLength(EMBED_LIMITS.content);
    expect(out.embeds?.[0].description).toHaveLength(EMBED_LIMITS.description);
  });
});
