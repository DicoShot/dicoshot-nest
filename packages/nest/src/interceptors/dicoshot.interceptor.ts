import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';

import type { DicoshotOptions, InterceptorOptions } from 'dicoshot-core';
import { DicoshotClientImpl, getMessages } from 'dicoshot-core';

import { Request } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { DICOSHOT_CLIENT, DICOSHOT_OPTIONS } from '../dicoshot.constants';
import { buildErrorEmbed, buildSlowEmbed } from '../utils/embed.builder';
import { ThrottleUtil } from '../utils/throttle.util';

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
        if (duration >= threshold && this.isAllowedEnvironment(opts.environment)) {
          this.notifySlow(request, duration).catch((err: Error) =>
            this.logger.warn(`Failed to send slow request notification: ${err.message}`),
          );
        }
      }),
      catchError((err: unknown) => {
        // 에러 알림은 filter가 없을 때만 인터셉터에서 처리 (중복 방지)
        if (!this.options.filter) {
          try {
            const status = err instanceof HttpException ? err.getStatus() : 500;
            if (status >= (opts.minStatus ?? 500) && this.shouldNotifyError(err, request, opts)) {
              const duration = Date.now() - start;
              this.notifyError(request, err, duration, opts).catch((e: Error) =>
                this.logger.warn(`Failed to send error notification: ${e.message}`),
              );
            }
          } catch (e) {
            this.logger.warn(`Failed to prepare error notification: ${(e as Error).message}`);
          }
        }
        return throwError(() => err);
      }),
    );
  }

  private resolveOptions(): InterceptorOptions {
    const interceptor = this.options.interceptor;
    const specific = !interceptor || interceptor === true ? {} : interceptor;
    return {
      environment: this.options.environment,
      mention: this.options.mention,
      throttle: this.options.throttle,
      ...specific,
    };
  }

  private shouldNotifyError(err: unknown, request: Request, opts: InterceptorOptions): boolean {
    if (opts.ignoreErrors?.some((cls) => err instanceof cls)) return false;
    if (!this.isAllowedEnvironment(opts.environment)) return false;
    if (opts.throttle) {
      const name = err instanceof Error ? err.constructor.name : 'Error';
      const key = `${name}_${request.method}_${request.path}`;
      if (ThrottleUtil.shouldThrottle(key, opts.throttle)) return false;
    }
    return true;
  }

  private isAllowedEnvironment(environment: string | string[] | undefined): boolean {
    if (!environment) return true;
    const envs = Array.isArray(environment) ? environment : [environment];
    return envs.includes(process.env.NODE_ENV ?? 'development');
  }

  private async notifySlow(request: Request, duration: number): Promise<void> {
    const webhookUrl = this.options.webhooks?.slow ?? this.options.webhookUrl;
    if (!webhookUrl) {
      this.logger.warn('No slow-response webhook URL configured; skipping Discord notification');
      return;
    }

    const embed = buildSlowEmbed({
      msg: getMessages(this.options.locale),
      env: process.env.NODE_ENV ?? 'development',
      appName: this.options.applicationName ?? 'Unknown',
      method: request.method,
      path: request.path,
      durationMs: duration,
    });

    await this.client.sendTo(webhookUrl, { embeds: [embed] });
  }

  private async notifyError(
    request: Request,
    err: unknown,
    duration: number,
    opts: InterceptorOptions,
  ): Promise<void> {
    const webhookUrl = this.options.webhooks?.error ?? this.options.webhookUrl;
    if (!webhookUrl) {
      this.logger.warn('No error webhook URL configured; skipping Discord notification');
      return;
    }

    const embed = buildErrorEmbed({
      msg: getMessages(this.options.locale),
      env: process.env.NODE_ENV ?? 'development',
      appName: this.options.applicationName ?? 'Unknown',
      error: err,
      method: request.method,
      path: request.path,
      durationMs: duration,
      body: (request as Request & { body?: unknown }).body,
      includeStack: opts.includeStack !== false,
      includeRequest: opts.includeRequest !== false,
    });

    await this.client.sendTo(webhookUrl, {
      ...(opts.mention !== undefined && { content: opts.mention }),
      embeds: [embed],
    });
  }
}
