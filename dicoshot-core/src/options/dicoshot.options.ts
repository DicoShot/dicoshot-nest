export interface FilterOptions {
  ignore?: number[];
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
  timeoutMs?: number;
  webhooks?: DicoshotWebhooks;
  filter?: boolean | FilterOptions;
  interceptor?: boolean | InterceptorOptions;
  retry?: boolean | RetryOptions;
}
