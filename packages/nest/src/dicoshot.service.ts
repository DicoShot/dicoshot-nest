import { Inject, Injectable, Logger } from '@nestjs/common';

import type { DiscordField, DiscordMessage } from 'dicoshot-core';
import { DicoshotClientImpl } from 'dicoshot-core';

import { DICOSHOT_CLIENT } from './dicoshot.constants';

export type ColorPreset = 'success' | 'danger' | 'warning' | 'info';

export interface CustomMessageOptions {
  title: string;
  description?: string;
  color?: ColorPreset | number;
  fields?: DiscordField[];
  mention?: string;
}

const COLOR_MAP: Record<ColorPreset, number> = {
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  info: 0x5865f2,
};

@Injectable()
export class DicoshotService {
  private readonly logger = new Logger(DicoshotService.name);

  constructor(@Inject(DICOSHOT_CLIENT) private readonly client: DicoshotClientImpl) {}

  /**
   * Never throws: swallows webhook delivery failures (logged as WARN) and
   * returns whether the message was sent, consistent with the rest of the SDK.
   */
  async send(message: DiscordMessage): Promise<boolean> {
    try {
      await this.client.send(message);
      return true;
    } catch (err) {
      this.logger.warn(`Failed to send Discord message: ${(err as Error).message}`);
      return false;
    }
  }

  async sendCustom({
    title,
    description,
    color,
    fields,
    mention,
  }: CustomMessageOptions): Promise<boolean> {
    const resolvedColor = typeof color === 'string' ? COLOR_MAP[color] : color;
    const resolvedDescription = [description, mention].filter(Boolean).join('\n') || undefined;

    return this.send({
      embeds: [{ title, description: resolvedDescription, color: resolvedColor, fields }],
    });
  }
}
