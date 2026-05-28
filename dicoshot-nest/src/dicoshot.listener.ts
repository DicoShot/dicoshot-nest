import {
  Injectable,
  Inject,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { DicoshotOptions } from 'dicoshot-core';
import { DicoshotClientImpl, MessageFactory } from 'dicoshot-core';
import { DICOSHOT_OPTIONS, DICOSHOT_CLIENT } from './dicoshot.constants';

@Injectable()
export class DicoshotListener
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DicoshotListener.name);
  private readonly factory: MessageFactory;

  constructor(
    @Inject(DICOSHOT_OPTIONS) private readonly options: DicoshotOptions,
    @Inject(DICOSHOT_CLIENT) private readonly client: DicoshotClientImpl,
  ) {
    this.factory = new MessageFactory(options);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.options.webhookUrl || this.options.enabled === false) return;
    if (this.options.notifyOnStartup === false) return;
    try {
      await this.client.send(this.factory.startup());
    } catch (err) {
      this.logger.warn(
        `Failed to send startup notification: ${(err as Error).message}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.options.webhookUrl || this.options.enabled === false) return;
    if (this.options.notifyOnShutdown === false) return;
    try {
      await this.client.send(this.factory.shutdown());
    } catch (err) {
      this.logger.warn(
        `Failed to send shutdown notification: ${(err as Error).message}`,
      );
    }
  }
}
