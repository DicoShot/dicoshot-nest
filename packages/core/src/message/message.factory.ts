import * as os from 'os';

import { getMessages } from '../i18n/messages';
import { DicoshotOptions } from '../options/dicoshot.options';
import { DiscordMessage } from './discord.message';

const STARTUP_COLOR = 5763719;
const SHUTDOWN_COLOR = 15548997;

export class MessageFactory {
  private readonly version: string;
  private readonly env: string;

  constructor(private readonly options: DicoshotOptions) {
    this.version = process.env['npm_package_version'] ?? '0.0.0';
    this.env = process.env['NODE_ENV'] ?? 'development';
  }

  startup(): DiscordMessage {
    const now = new Date().toISOString();
    const msg = getMessages(this.options.locale);
    return {
      embeds: [
        {
          title: msg.startupTitle,
          color: STARTUP_COLOR,
          fields: [
            {
              name: msg.field.service,
              value: this.options.applicationName ?? 'Unknown',
              inline: true,
            },
            { name: msg.field.environment, value: this.env, inline: true },
            { name: msg.field.version, value: this.version, inline: true },
            { name: msg.field.hostname, value: os.hostname(), inline: true },
            { name: msg.field.time, value: now, inline: false },
          ],
          timestamp: now,
        },
      ],
    };
  }

  shutdown(): DiscordMessage {
    const now = new Date().toISOString();
    const msg = getMessages(this.options.locale);
    return {
      embeds: [
        {
          title: msg.shutdownTitle,
          color: SHUTDOWN_COLOR,
          fields: [
            {
              name: msg.field.service,
              value: this.options.applicationName ?? 'Unknown',
              inline: true,
            },
            { name: msg.field.environment, value: this.env, inline: true },
            { name: msg.field.hostname, value: os.hostname(), inline: true },
            { name: msg.field.time, value: now, inline: false },
          ],
          timestamp: now,
        },
      ],
    };
  }
}
