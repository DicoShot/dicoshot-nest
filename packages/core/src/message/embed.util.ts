import { DiscordEmbed, DiscordMessage } from './discord.message';

/** Discord가 문서화한 임베드·메시지 길이 제한. 넘으면 웹훅이 400으로 거절한다. */
export const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  total: 6000,
  content: 2000,
} as const;

const ELLIPSIS = '…';
const FENCE = '```';
/** 합계 예산을 맞추려고 줄이다가 이보다 짧아지면 필드를 통째로 뺀다 */
const MIN_FIELD_VALUE_LENGTH = 16;

/** 코드 스팬/코드 블록 안에서 닫는 기호를 깨뜨리지 않도록 백틱을 비슷한 문자로 바꾼다 */
function neutralizeBackticks(text: string): string {
  return text.replace(/`/g, 'ˋ');
}

/** 백틱이 든 텍스트도 렌더가 깨지지 않는 인라인 코드 스팬 */
export function codeSpan(text: string): string {
  return `\`${neutralizeBackticks(text)}\``;
}

/** 백틱이 든 텍스트도 렌더가 깨지지 않는 코드 블록 */
export function codeBlock(text: string, language = ''): string {
  return `${FENCE}${language}\n${neutralizeBackticks(text)}\n${FENCE}`;
}

function cut(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max === 1) return ELLIPSIS;
  // 서로게이트 쌍 중간에서 자르지 않는다
  let end = max - 1;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return text.slice(0, end) + ELLIPSIS;
}

/**
 * 최대 `max`자로 자르고 잘렸으면 `…`를 붙인다. 코드 블록·코드 스팬으로 감싼 텍스트는
 * 감싸는 기호를 유지한 채 안쪽만 자르고, 그 밖에 열린 채 남은 코드 블록은 닫는다.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;

  const fenced = /^(```[^\n]*\n)([\s\S]*?)(\n```)$/.exec(text);
  if (fenced) {
    const [, open, inner, close] = fenced;
    return open + cut(inner, max - open.length - close.length) + close;
  }

  if (text.length >= 2 && text.startsWith('`') && text.endsWith('`') && !text.startsWith(FENCE)) {
    return '`' + cut(text.slice(1, -1), max - 2) + '`';
  }

  const result = cut(text, max);
  const fences = result.split(FENCE).length - 1;
  if (fences % 2 === 1) {
    // 열린 코드 블록을 닫을 자리를 확보한다
    return cut(result, max - (FENCE.length + 1)) + `\n${FENCE}`;
  }
  return result;
}

export interface FitEmbedOptions {
  /**
   * `embed.fields`와 같은 순서의 우선순위. 값이 작은 필드부터 합계 예산에서 먼저 줄어든다.
   * 지정하지 않으면 뒤쪽 필드가 먼저 줄어든다.
   */
  fieldPriorities?: number[];
}

function embedLength(embed: DiscordEmbed): number {
  let total = (embed.title?.length ?? 0) + (embed.description?.length ?? 0);
  for (const field of embed.fields ?? []) total += field.name.length + field.value.length;
  return total;
}

/**
 * 임베드를 Discord 한도 안으로 만든다. 항목별 한도로 자르고, 필드는 25개까지만 남기며,
 * 합계 6000자를 넘으면 우선순위가 낮은 필드 → 설명 → 제목 순으로 줄인다.
 * 한도 안이면 입력과 같은 내용을 돌려준다.
 */
export function fitEmbed(embed: DiscordEmbed, options: FitEmbedOptions = {}): DiscordEmbed {
  const priorities = options.fieldPriorities;
  let entries = (embed.fields ?? []).map((field, index) => ({
    field: {
      ...field,
      name: truncate(field.name, EMBED_LIMITS.fieldName),
      value: truncate(field.value, EMBED_LIMITS.fieldValue),
    },
    priority: priorities?.[index] ?? -index,
    index,
  }));

  if (entries.length > EMBED_LIMITS.fields) {
    const keep = new Set(
      [...entries]
        .sort((a, b) => b.priority - a.priority || a.index - b.index)
        .slice(0, EMBED_LIMITS.fields)
        .map((e) => e.index),
    );
    entries = entries.filter((e) => keep.has(e.index));
  }

  const fit: DiscordEmbed = {
    ...embed,
    ...(embed.title !== undefined && { title: truncate(embed.title, EMBED_LIMITS.title) }),
    ...(embed.description !== undefined && {
      description: truncate(embed.description, EMBED_LIMITS.description),
    }),
    ...(embed.fields !== undefined && { fields: entries.map((e) => e.field) }),
  };

  let excess = embedLength(fit) - EMBED_LIMITS.total;
  if (excess <= 0) return fit;

  // 1) 우선순위가 낮은 필드부터 값을 줄이고, 너무 짧아지면 뺀다
  const shrinkOrder = [...entries].sort((a, b) => a.priority - b.priority || b.index - a.index);
  const removed = new Set<number>();
  for (const entry of shrinkOrder) {
    if (excess <= 0) break;
    const { name, value } = entry.field;
    const target = value.length - excess;
    if (target < MIN_FIELD_VALUE_LENGTH) {
      excess -= name.length + value.length;
      removed.add(entry.index);
    } else {
      entry.field = { ...entry.field, value: truncate(value, target) };
      excess -= value.length - entry.field.value.length;
    }
  }
  fit.fields = entries.filter((e) => !removed.has(e.index)).map((e) => e.field);

  // 2) 그래도 넘으면 설명, 마지막으로 제목
  excess = embedLength(fit) - EMBED_LIMITS.total;
  if (excess > 0 && fit.description) {
    fit.description = truncate(fit.description, Math.max(0, fit.description.length - excess));
    excess = embedLength(fit) - EMBED_LIMITS.total;
  }
  if (excess > 0 && fit.title) {
    fit.title = truncate(fit.title, Math.max(0, fit.title.length - excess));
  }
  return fit;
}

/** 메시지의 content와 모든 임베드를 Discord 한도 안으로 만든다. */
export function fitMessage(message: DiscordMessage): DiscordMessage {
  return {
    ...message,
    ...(message.content !== undefined && {
      content: truncate(message.content, EMBED_LIMITS.content),
    }),
    ...(message.embeds !== undefined && { embeds: message.embeds.map((e) => fitEmbed(e)) }),
  };
}
