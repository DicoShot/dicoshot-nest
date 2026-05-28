import { Module, DynamicModule, Provider, ModuleMetadata } from '@nestjs/common';
import { DicoshotOptions, DicoshotClientImpl } from 'dicoshot-core';
import { DICOSHOT_OPTIONS, DICOSHOT_CLIENT } from './dicoshot.constants';
import { DicoshotListener } from './dicoshot.listener';
import { DicoshotService } from './dicoshot.service';

interface DicoshotAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => Promise<DicoshotOptions> | DicoshotOptions;
  inject?: unknown[];
}

const clientProvider: Provider = {
  provide: DICOSHOT_CLIENT,
  useFactory: (options: DicoshotOptions) => new DicoshotClientImpl(options),
  inject: [DICOSHOT_OPTIONS],
};

@Module({})
export class DicoshotModule {
  static register(options: DicoshotOptions): DynamicModule {
    return {
      module: DicoshotModule,
      providers: [
        { provide: DICOSHOT_OPTIONS, useValue: options },
        clientProvider,
        DicoshotListener,
        DicoshotService,
      ],
      exports: [DicoshotService],
    };
  }

  static registerAsync({ useFactory, inject, imports }: DicoshotAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: DICOSHOT_OPTIONS,
      useFactory,
      inject: (inject as []) ?? [],
    };
    return {
      module: DicoshotModule,
      imports: imports ?? [],
      providers: [optionsProvider, clientProvider, DicoshotListener, DicoshotService],
      exports: [DicoshotService],
    };
  }
}
