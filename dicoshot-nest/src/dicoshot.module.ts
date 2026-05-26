import { Module, DynamicModule, Provider, ModuleMetadata } from '@nestjs/common';
import { DicoshotOptions } from 'dicoshot-core';
import { DICOSHOT_OPTIONS } from './dicoshot.constants';
import { DicoshotListener } from './dicoshot.listener';

interface DicoshotAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => Promise<DicoshotOptions> | DicoshotOptions;
  inject?: unknown[];
}

@Module({})
export class DicoshotModule {
  static register(options: DicoshotOptions): DynamicModule {
    return {
      module: DicoshotModule,
      providers: [
        { provide: DICOSHOT_OPTIONS, useValue: options },
        DicoshotListener,
      ],
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
      providers: [optionsProvider, DicoshotListener],
    };
  }
}
