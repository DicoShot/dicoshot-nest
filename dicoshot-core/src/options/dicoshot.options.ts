export interface DicoshotOptions {
  webhookUrl: string;
  enabled?: boolean;
  notifyOnStartup?: boolean;
  notifyOnShutdown?: boolean;
  applicationName?: string;
  username?: string;
  timeoutMs?: number;
}
