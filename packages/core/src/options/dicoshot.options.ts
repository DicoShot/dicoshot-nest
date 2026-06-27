import { DicoshotMessages, Locale } from '../i18n/messages';

export interface FilterOptions {
  ignore?: number[];
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  ignoreErrors?: Function[];
  environment?: string | string[];
  mention?: string;
  throttle?: number;
  includeStack?: boolean;
  includeRequest?: boolean;
  minStatus?: number;
}

export interface InterceptorOptions {
  slowThreshold?: number;
  excludePaths?: string[];
  onlyErrors?: boolean;
  minStatus?: number;
  includeStack?: boolean;
  includeRequest?: boolean;
  mention?: string;
  environment?: string | string[];
  throttle?: number;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  ignoreErrors?: Function[];
}

export interface DicoshotWebhooks {
  error?: string;
  slow?: string;
}

export interface RetryOptions {
  attempts?: number;
  backoffMs?: number;
}

export interface DicoshotOptions {
  webhookUrl?: string;
  enabled?: boolean;
  notifyOnStartup?: boolean;
  notifyOnShutdown?: boolean;
  applicationName?: string;
  /**
   * Language for notification titles/field labels. Defaults to 'en'.
   * Built-in: 'en' | 'ko' | 'ja' | 'zh'. For any other language, pass a
   * full DicoshotMessages object with your own translations.
   */
  locale?: Locale | DicoshotMessages;
  timeoutMs?: number;
  webhooks?: DicoshotWebhooks;
  /**
   * Register as a global NestJS module so DicoshotService can be injected
   * anywhere without importing DicoshotModule in each feature module.
   */
  global?: boolean;
  /** Shared default applied to both filter and interceptor; overridden by per-option settings. */
  environment?: string | string[];
  /** Shared default applied to both filter and interceptor; overridden by per-option settings. */
  mention?: string;
  /** Shared default applied to both filter and interceptor; overridden by per-option settings. */
  throttle?: number;
  filter?: boolean | FilterOptions;
  interceptor?: boolean | InterceptorOptions;
  retry?: boolean | RetryOptions;
}
