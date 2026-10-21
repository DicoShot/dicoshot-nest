import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
  Logger,
} from '@nestjs/common';

import type { DicoshotOptions, FilterOptions } from 'dicoshot-core';
import { DicoshotClientImpl, getMessages } from 'dicoshot-core';

import { Request, Response } from 'express';

import { DICOSHOT_CLIENT, DICOSHOT_OPTIONS } from '../dicoshot.constants';
import { buildErrorEmbed } from '../utils/embed.builder';
import { ThrottleUtil } from '../utils/throttle.util';

@Catch()
export class DicoshotExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DicoshotExceptionFilter.name);

  constructor(
    @Inject(DICOSHOT_CLIENT) private readonly client: DicoshotClientImpl,
    @Inject(DICOSHOT_OPTIONS) private readonly options: DicoshotOptions,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // Skip non-HTTP contexts (WebSocket, RPC, GraphQL) — switchToHttp() would be unsafe
    if (host.getType<string>() !== 'http') return;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    if (this.options.filter) {
      // 알림 경로의 어떤 예외도 오류 응답 자체를 바꾸면 안 된다
      try {
        const opts = this.resolveOptions();
        if (this.shouldNotify(exception, request, status, opts)) {
          this.notify(exception, request, status, opts).catch((err: Error) =>
            this.logger.warn(`Failed to send exception notification: ${err.message}`),
          );
        }
      } catch (err) {
        this.logger.warn(`Failed to prepare exception notification: ${(err as Error).message}`);
      }
    }

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: status, message: 'Internal server error' };

    response.status(status).json(body);
  }

  private resolveOptions(): FilterOptions {
    const filter = this.options.filter;
    const specific = !filter || filter === true ? {} : filter;
    return {
      environment: this.options.environment,
      mention: this.options.mention,
      throttle: this.options.throttle,
      ...specific,
    };
  }

  private shouldNotify(
    exception: unknown,
    request: Request,
    status: number,
    opts: FilterOptions,
  ): boolean {
    if (status < (opts.minStatus ?? 500)) return false;

    if (opts.ignore?.includes(status)) return false;

    if (opts.ignoreErrors?.some((cls) => exception instanceof cls)) return false;

    if (opts.environment) {
      const envs = Array.isArray(opts.environment) ? opts.environment : [opts.environment];
      if (!envs.includes(process.env.NODE_ENV ?? 'development')) return false;
    }

    if (opts.throttle) {
      const name = exception instanceof Error ? exception.constructor.name : 'Error';
      const key = `${name}_${request.method}_${request.path}`;
      if (ThrottleUtil.shouldThrottle(key, opts.throttle)) return false;
    }

    return true;
  }

  private async notify(
    exception: unknown,
    request: Request,
    status: number,
    opts: FilterOptions,
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
      error: exception,
      method: request.method,
      path: request.path,
      status,
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
