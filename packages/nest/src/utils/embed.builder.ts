import type { DicoshotMessages, DiscordEmbed, DiscordField } from 'dicoshot-core';
import { codeBlock, codeSpan, fitEmbed } from 'dicoshot-core';

import { StackUtil } from './stack.util';

const ERROR_COLOR = 0xed4245;
const SLOW_COLOR = 0xfee75c;

// 합계 예산이 모자랄 때 값이 작은 필드부터 줄어든다 (제목 > 오류 메시지 > 위치 > 경로 > 스택 > 본문)
const PRIORITY = { meta: 100, location: 60, path: 50, stack: 20, body: 10 } as const;

interface PrioritizedField {
  field: DiscordField;
  priority: number;
}

function toEmbed(base: Omit<DiscordEmbed, 'fields'>, entries: PrioritizedField[]): DiscordEmbed {
  return fitEmbed(
    { ...base, fields: entries.map((e) => e.field) },
    { fieldPriorities: entries.map((e) => e.priority) },
  );
}

export interface ErrorEmbedInput {
  msg: DicoshotMessages;
  env: string;
  appName: string;
  error: unknown;
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  body?: unknown;
  includeStack: boolean;
  includeRequest: boolean;
}

export function buildErrorEmbed(input: ErrorEmbedInput): DiscordEmbed {
  const { msg, env, appName, error, method, path } = input;
  const errorName = error instanceof Error ? error.constructor.name : 'UnknownError';
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const entries: PrioritizedField[] = [
    { field: { name: msg.field.service, value: appName, inline: true }, priority: PRIORITY.meta },
    { field: { name: msg.field.environment, value: env, inline: true }, priority: PRIORITY.meta },
  ];
  if (input.status !== undefined) {
    entries.push({
      field: { name: msg.field.status, value: String(input.status), inline: true },
      priority: PRIORITY.meta,
    });
  }
  entries.push(
    { field: { name: msg.field.method, value: method, inline: true }, priority: PRIORITY.meta },
    { field: { name: msg.field.path, value: path, inline: true }, priority: PRIORITY.path },
  );
  if (input.durationMs !== undefined) {
    entries.push({
      field: { name: msg.field.duration, value: `${input.durationMs}ms`, inline: true },
      priority: PRIORITY.meta,
    });
  }

  const location = StackUtil.extractLocation(stack);
  if (location) {
    entries.push({
      field: { name: msg.field.location, value: codeSpan(location), inline: false },
      priority: PRIORITY.location,
    });
  }

  if (input.includeRequest && input.body && typeof input.body === 'object') {
    if (Object.keys(input.body).length > 0) {
      entries.push({
        field: {
          name: msg.field.requestBody,
          value: codeBlock(JSON.stringify(input.body).slice(0, 900), 'json'),
          inline: false,
        },
        priority: PRIORITY.body,
      });
    }
  }

  if (input.includeStack && stack) {
    entries.push({
      field: { name: msg.field.stackTrace, value: codeBlock(stack.slice(0, 1000)), inline: false },
      priority: PRIORITY.stack,
    });
  }

  return toEmbed(
    {
      title: `🚨 [${env}] ${appName} — ${errorName}`,
      description: codeSpan(errorMessage),
      color: ERROR_COLOR,
      timestamp: new Date().toISOString(),
    },
    entries,
  );
}

export interface SlowEmbedInput {
  msg: DicoshotMessages;
  env: string;
  appName: string;
  method: string;
  path: string;
  durationMs: number;
}

export function buildSlowEmbed(input: SlowEmbedInput): DiscordEmbed {
  const { msg, env, appName } = input;
  return toEmbed(
    {
      title: `🐢 [${env}] ${appName} — ${msg.slowResponseLabel}`,
      color: SLOW_COLOR,
      timestamp: new Date().toISOString(),
    },
    [
      { field: { name: msg.field.service, value: appName, inline: true }, priority: PRIORITY.meta },
      { field: { name: msg.field.environment, value: env, inline: true }, priority: PRIORITY.meta },
      {
        field: { name: msg.field.method, value: input.method, inline: true },
        priority: PRIORITY.meta,
      },
      { field: { name: msg.field.path, value: input.path, inline: true }, priority: PRIORITY.path },
      {
        field: { name: msg.field.duration, value: `${input.durationMs}ms`, inline: true },
        priority: PRIORITY.meta,
      },
    ],
  );
}
