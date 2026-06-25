import { SetMetadata } from '@nestjs/common';

import { DICOSHOT_NOTIFY_METADATA } from '../dicoshot.constants';
import type { ColorPreset } from '../dicoshot.service';

export type DicoshotNotifyResolver<T> = T | ((args: unknown[], result: unknown) => T);

export interface DicoshotNotifyOptions {
  title: DicoshotNotifyResolver<string>;
  description?: DicoshotNotifyResolver<string>;
  color?: ColorPreset | number;
}

/**
 * Sends a custom Discord message via DicoshotService once the decorated handler
 * resolves successfully. No-op on error (handled separately by filter/interceptor).
 */
export const DicoshotNotify = (options: DicoshotNotifyOptions): MethodDecorator =>
  SetMetadata(DICOSHOT_NOTIFY_METADATA, options);
