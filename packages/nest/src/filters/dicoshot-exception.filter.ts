import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
  Logger,
} from '@nestjs/common';

import type { DicoshotOptions, DiscordEmbed, FilterOptions } from 'dicoshot-core';
import { DicoshotClientImpl, getMessages } from 'dicoshot-core';

import { Request, Response } from 'express';

import { DICOSHOT_CLIENT, DICOSHOT_OPTIONS } from '../dicoshot.constants';
import { StackUtil } from '../utils/stack.util';
import { ThrottleUtil } from '../utils/throttle.util';

const ERROR_COLOR = 0xed4245;

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
      const opts = this.resolveOptions();
      if (this.shouldNotify(exception, request, status, opts)) {
        this.notify(exception, request, status, opts).catch((err: Error) =>
          this.logger.warn(`Failed to send exception notification: ${err.message}`),
        );
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
    if (!filter || filter === true) return {};
    return filter;
  }

  private shouldNotify(
    exception: unknown,
    request: Request,
    status: number,
    opts: FilterOptions,
  ): boolean {
    if (status < (opts.minStatus ?? 500)) return false;

    if (opts.ignore?.includes(status)) return false;

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

    const env = process.env.NODE_ENV ?? 'development';
    const appName = this.options.applicationName ?? 'Unknown';
    const errorName = exception instanceof Error ? exception.constructor.name : 'UnknownError';
    const errorMessage = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;
    const now = new Date().toISOString();
    const msg = getMessages(this.options.locale);

    const fields = [
      { name: msg.field.service, value: appName, inline: true },
      { name: msg.field.environment, value: env, inline: true },
      { name: msg.field.status, value: String(status), inline: true },
      { name: msg.field.method, value: request.method, inline: true },
      { name: msg.field.path, value: request.path, inline: true },
    ];

    const location = StackUtil.extractLocation(stack);
    if (location) {
      fields.push({ name: msg.field.location, value: `\`${location}\``, inline: false });
    }

    if (opts.includeRequest !== false) {
      const body = (request as Request & { body?: unknown }).body;
      if (body && typeof body === 'object' && Object.keys(body).length > 0) {
        fields.push({
          name: msg.field.requestBody,
          value: `\`\`\`json\n${JSON.stringify(body).slice(0, 900)}\n\`\`\``,
          inline: false,
        });
      }
    }

    if (opts.includeStack !== false && stack) {
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

    await this.client.sendTo(webhookUrl, {
      ...(opts.mention !== undefined && { content: opts.mention }),
      embeds: [embed],
    });
  }
}
