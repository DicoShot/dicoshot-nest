import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { DicoshotNotifyOptions } from '../decorators/dicoshot-notify.decorator';
import { DICOSHOT_NOTIFY_METADATA } from '../dicoshot.constants';
import { DicoshotService } from '../dicoshot.service';

@Injectable()
export class DicoshotNotifyInterceptor implements NestInterceptor {
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
        const title =
          typeof options.title === 'function' ? options.title(args, result) : options.title;
        const description =
          typeof options.description === 'function'
            ? options.description(args, result)
            : options.description;

        // sendCustom() never rejects: failures are logged internally by DicoshotService
        void this.dicoshot.sendCustom({ title, description, color: options.color });
      }),
    );
  }
}
