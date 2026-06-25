import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';

import type { DicoshotOptions, DiscordEmbed, InterceptorOptions } from 'dicoshot-core';
import { DicoshotClientImpl, getMessages } from 'dicoshot-core';

import { Request } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { DICOSHOT_CLIENT, DICOSHOT_OPTIONS } from '../dicoshot.constants';
import { StackUtil } from '../utils/stack.util';

const SLOW_COLOR = 0xfee75c;
const ERROR_COLOR = 0xed4245;

@Injectable()
export class DicoshotInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DicoshotInterceptor.name);

  constructor(
    @Inject(DICOSHOT_CLIENT) private readonly client: DicoshotClientImpl,
    @Inject(DICOSHOT_OPTIONS) private readonly options: DicoshotOptions,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // No-op when interceptor is not configured (always-registered via registerAsync)
    if (!this.options.interceptor) return next.handle();

    const start = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const opts = this.resolveOptions();
    const threshold = opts.slowThreshold ?? 3000; // resolve once, not per-tap

    if (opts.excludePaths?.some((p) => request.path.startsWith(p))) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        if (opts.onlyErrors) return;
        const duration = Date.now() - start;
        if (duration >= threshold) {
          this.notifySlow(request, duration).catch((err: Error) =>
            this.logger.warn(`Failed to send slow request notification: ${err.message}`),
          );
        }
      }),
      catchError((err: unknown) => {
        // 에러 알림은 filter가 없을 때만 인터셉터에서 처리 (중복 방지)
        if (!this.options.filter) {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          if (status >= (opts.minStatus ?? 500)) {
            const duration = Date.now() - start;
            this.notifyError(request, err, duration).catch((e: Error) =>
              this.logger.warn(`Failed to send error notification: ${e.message}`),
            );
          }
        }
        return throwError(() => err);
      }),
    );
  }

  private resolveOptions(): InterceptorOptions {
    const interceptor = this.options.interceptor;
    if (!interceptor || interceptor === true) return {};
    return interceptor;
  }

  private async notifySlow(request: Request, duration: number): Promise<void> {
    const webhookUrl = this.options.webhooks?.slow ?? this.options.webhookUrl;
    if (!webhookUrl) {
      this.logger.warn('No slow-response webhook URL configured; skipping Discord notification');
      return;
    }

    const env = process.env.NODE_ENV ?? 'development';
    const appName = this.options.applicationName ?? 'Unknown';
    const now = new Date().toISOString();
    const msg = getMessages(this.options.locale);

    const embed: DiscordEmbed = {
      title: `🐢 [${env}] ${appName} — ${msg.slowResponseLabel}`,
      color: SLOW_COLOR,
      fields: [
        { name: msg.field.service, value: appName, inline: true },
        { name: msg.field.environment, value: env, inline: true },
        { name: msg.field.method, value: request.method, inline: true },
        { name: msg.field.path, value: request.path, inline: true },
        { name: msg.field.duration, value: `${duration}ms`, inline: true },
      ],
      timestamp: now,
    };

    await this.client.sendTo(webhookUrl, { embeds: [embed] });
  }

  private async notifyError(request: Request, err: unknown, duration: number): Promise<void> {
    const webhookUrl = this.options.webhooks?.error ?? this.options.webhookUrl;
    if (!webhookUrl) {
      this.logger.warn('No error webhook URL configured; skipping Discord notification');
      return;
    }

    const env = process.env.NODE_ENV ?? 'development';
    const appName = this.options.applicationName ?? 'Unknown';
    const errorName = err instanceof Error ? err.constructor.name : 'UnknownError';
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const now = new Date().toISOString();
    const msg = getMessages(this.options.locale);

    const fields = [
      { name: msg.field.service, value: appName, inline: true },
      { name: msg.field.environment, value: env, inline: true },
      { name: msg.field.method, value: request.method, inline: true },
      { name: msg.field.path, value: request.path, inline: true },
      { name: msg.field.duration, value: `${duration}ms`, inline: true },
    ];

    const location = StackUtil.extractLocation(stack);
    if (location) {
      fields.push({ name: msg.field.location, value: `\`${location}\``, inline: false });
    }

    if (stack) {
      fields.push({
        name: msg.field.stackTrace,
        value: `\`\`\`\n${stack.slice(0, 1000)}\n\`\`\``,
        inline: false,
      });
    }

    const embed: DiscordEmbed = {
      title: `🚨 [${env}] ${appName} — ${errorName}`,
      description: `\`${errorMessage}\``,
      color: ERROR_COLOR,
      fields,
      timestamp: now,
    };

    await this.client.sendTo(webhookUrl, { embeds: [embed] });
  }
}
