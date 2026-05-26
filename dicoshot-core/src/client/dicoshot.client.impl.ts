import axios from 'axios';
import { DicoshotOptions } from '../options/dicoshot.options';
import { DiscordMessage } from '../message/discord.message';
import { DicoshotClient } from './dicoshot.client';

export class DicoshotClientImpl implements DicoshotClient {
  constructor(private readonly options: DicoshotOptions) {}

  async send(message: DiscordMessage): Promise<void> {
    await axios.post(this.options.webhookUrl, message, {
      timeout: this.options.timeoutMs ?? 5000,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
