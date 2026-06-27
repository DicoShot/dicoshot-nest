import { DynamicModule, Module, ModuleMetadata, Provider } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import {
  DicoshotClientImpl,
  DicoshotOptions,
  FilterOptions,
  InterceptorOptions,
} from 'dicoshot-core';

import { DICOSHOT_CLIENT, DICOSHOT_OPTIONS } from './dicoshot.constants';
import { DicoshotListener } from './dicoshot.listener';
import { DicoshotService } from './dicoshot.service';
import { DicoshotExceptionFilter } from './filters/dicoshot-exception.filter';
import { DicoshotInterceptor } from './interceptors/dicoshot.interceptor';
import { DicoshotNotifyInterceptor } from './interceptors/dicoshot-notify.interceptor';

interface DicoshotAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => Promise<DicoshotOptions> | DicoshotOptions;
  inject?: unknown[];
  global?: boolean;
  /**
   * Set at registration time so APP_FILTER is conditionally added.
   * Merged into DICOSHOT_OPTIONS and overrides the factory's filter value.
   */
  filter?: boolean | FilterOptions;
  /**
   * Set at registration time so APP_INTERCEPTOR is conditionally added.
   * Merged into DICOSHOT_OPTIONS and overrides the factory's interceptor value.
   */
  interceptor?: boolean | InterceptorOptions;
}

const clientProvider: Provider = {
  provide: DICOSHOT_CLIENT,
  useFactory: (options: DicoshotOptions) => new DicoshotClientImpl(options),
  inject: [DICOSHOT_OPTIONS],
};

function buildProviders(options: DicoshotOptions): Provider[] {
  const providers: Provider[] = [
    { provide: DICOSHOT_OPTIONS, useValue: options },
    clientProvider,
    DicoshotListener,
    DicoshotService,
    // Always registered: no-op unless a handler is annotated with @DicoshotNotify
    { provide: APP_INTERCEPTOR, useClass: DicoshotNotifyInterceptor },
  ];

  if (options.filter) {
    providers.push({ provide: APP_FILTER, useClass: DicoshotExceptionFilter });
  }

  if (options.interceptor) {
    providers.push({ provide: APP_INTERCEPTOR, useClass: DicoshotInterceptor });
  }

  return providers;
}

@Module({})
export class DicoshotModule {
  static register(options: DicoshotOptions): DynamicModule {
    return {
      module: DicoshotModule,
      global: options.global ?? false,
      providers: buildProviders(options),
      exports: [DicoshotService],
    };
  }

  static registerAsync({
    useFactory,
    inject,
    imports,
    global: isGlobal,
    filter,
    interceptor,
  }: DicoshotAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: DICOSHOT_OPTIONS,
      useFactory: async (...args: unknown[]) => {
        const opts = await useFactory(...args);
        // Merge registration-time flags so runtime options stay consistent
        return {
          ...opts,
          ...(filter !== undefined && { filter }),
          ...(interceptor !== undefined && { interceptor }),
        };
      },
      inject: (inject as []) ?? [],
    };

    const providers: Provider[] = [
      optionsProvider,
      clientProvider,
      DicoshotListener,
      DicoshotService,
      // Always registered: no-op unless a handler is annotated with @DicoshotNotify
      { provide: APP_INTERCEPTOR, useClass: DicoshotNotifyInterceptor },
    ];

    if (filter) {
      providers.push({ provide: APP_FILTER, useClass: DicoshotExceptionFilter });
    }

    if (interceptor) {
      providers.push({ provide: APP_INTERCEPTOR, useClass: DicoshotInterceptor });
    }

    return {
      module: DicoshotModule,
      global: isGlobal ?? false,
      imports: imports ?? [],
      providers,
      exports: [DicoshotService],
    };
  }
}
