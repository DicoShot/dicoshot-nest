import { Injectable, Inject } from '@nestjs/common';
import type { DiscordMessage } from 'dicoshot-core';
import { DicoshotClientImpl } from 'dicoshot-core';
import { DICOSHOT_CLIENT } from './dicoshot.constants';

export type ColorPreset = 'success' | 'danger' | 'warning' | 'info';

export interface CustomMessageOptions {
  title: string;
  description?: string;
  color?: ColorPreset | number;
}

const COLOR_MAP: Record<ColorPreset, number> = {
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  info: 0x5865f2,
};

@Injectable()
export class DicoshotService {
  constructor(
    @Inject(DICOSHOT_CLIENT) private readonly client: DicoshotClientImpl,
  ) {}

  async send(message: DiscordMessage): Promise<void> {
    await this.client.send(message);
  }

  async sendCustom({ title, description, color }: CustomMessageOptions): Promise<void> {
    const resolvedColor = typeof color === 'string' ? COLOR_MAP[color] : color;

    const message: DiscordMessage = {
      embeds: [{ title, description, color: resolvedColor }],
    };
    await this.client.send(message);
  }
}
