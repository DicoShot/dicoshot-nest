import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { DicoshotNotifyOptions } from '../decorators/dicoshot-notify.decorator';
import { DICOSHOT_NOTIFY_METADATA } from '../dicoshot.constants';
import { DicoshotService } from '../dicoshot.service';

@Injectable()
export class DicoshotNotifyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DicoshotNotifyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly dicoshot: DicoshotService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<DicoshotNotifyOptions | undefined>(
      DICOSHOT_NOTIFY_METADATA,
      context.getHandler(),
    );
    // No-op when the handler isn't annotated with @DicoshotNotify
    if (!options) return next.handle();

    const args = context.getArgs();

    return next.handle().pipe(
      tap((result) => {
        // 알림은 부가 기능이다. 리졸버나 전송이 던져도 이미 성공한 응답을 깨뜨리면 안 된다.
        try {
          const title =
            typeof options.title === 'function' ? options.title(args, result) : options.title;
          const description =
            typeof options.description === 'function'
              ? options.description(args, result)
              : options.description;

          // sendCustom() never rejects: failures are logged internally by DicoshotService
          void Promise.resolve(
            this.dicoshot.sendCustom({
              title,
              description,
              color: options.color,
              mention: options.mention,
            }),
          ).catch((err: unknown) => this.warn(err));
        } catch (err) {
          this.warn(err);
        }
      }),
    );
  }

  private warn(err: unknown): void {
    this.logger.warn(`Failed to send @DicoshotNotify notification: ${(err as Error)?.message}`);
  }
}
