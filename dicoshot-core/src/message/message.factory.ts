import * as os from 'os';

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
    return {
      username: this.options.username,
      embeds: [
        {
          title: '🟢 Application Started',
          color: STARTUP_COLOR,
          fields: [
            { name: 'Service', value: this.options.applicationName ?? 'Unknown', inline: true },
            { name: 'Environment', value: this.env, inline: true },
            { name: 'Version', value: this.version, inline: true },
            { name: 'Hostname', value: os.hostname(), inline: true },
            { name: 'Time', value: now, inline: false },
          ],
          timestamp: now,
        },
      ],
    };
  }

  shutdown(): DiscordMessage {
    const now = new Date().toISOString();
    return {
      username: this.options.username,
      embeds: [
        {
          title: '🔴 Application Stopped',
          color: SHUTDOWN_COLOR,
          fields: [
            { name: 'Service', value: this.options.applicationName ?? 'Unknown', inline: true },
            { name: 'Environment', value: this.env, inline: true },
            { name: 'Hostname', value: os.hostname(), inline: true },
            { name: 'Time', value: now, inline: false },
          ],
          timestamp: now,
        },
      ],
    };
  }
}
