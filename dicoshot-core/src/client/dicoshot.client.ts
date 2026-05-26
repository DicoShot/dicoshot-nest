import { DiscordMessage } from '../message/discord.message';

export interface DicoshotClient {
  send(message: DiscordMessage): Promise<void>;
}
