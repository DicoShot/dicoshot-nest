# dicoshot-nest

English | [한국어](README.ko.md)

An SDK that automatically notifies a Discord channel about NestJS application startup/shutdown, unhandled exceptions, and slow responses. Works by simply registering the module.

## Features

- **Automatic notifications**: Startup/shutdown notifications via `OnApplicationBootstrap`/`OnApplicationShutdown` hooks, no extra code required
- **Automatic exception notifications**: A global `ExceptionFilter` immediately sends unhandled exceptions to Discord (can include stack trace and request body)
- **Slow response notifications**: A `NestInterceptor` notifies when response time exceeds a threshold
- **Custom messages**: Inject `DicoshotService` to send arbitrary Discord messages at any time
- **Failure isolation**: Webhook delivery failures never block app startup/shutdown/request handling (only a WARN log is emitted)
- **MSA-friendly**: hostname and applicationName are automatically included in messages, making it easy to tell instances apart
- **Automatic environment detection**: `NODE_ENV` and `npm_package_version` are included automatically
- **Duplicate notification prevention**: The same error won't be notified twice even when filter and interceptor are both enabled

## Module structure

| Module          | Description                                                                       |
| --------------- | ----------------------------------------------------------------------------------- |
| `dicoshot-core` | Pure TypeScript with no NestJS dependency. Message model, webhook client          |
| `dicoshot-nest` | NestJS DynamicModule, lifecycle hooks, ExceptionFilter, Interceptor                |

## Installation

```bash
npm install dicoshot-nest
```

## Quick start

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { DicoshotModule } from 'dicoshot-nest';

@Module({
  imports: [
    DicoshotModule.register({
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      applicationName: 'my-service',
    }),
  ],
})
export class AppModule {}
```

When you run the app, the following embeds arrive in the Discord channel.

- **On startup**: green embed, title "🟢 Application Started", includes service name/environment/version/hostname/timestamp
- **On shutdown**: red embed, title "🔴 Application Stopped"

## ConfigService integration

```typescript
DicoshotModule.registerAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    webhookUrl: config.get('DISCORD_WEBHOOK_URL'),
    applicationName: config.get('APP_NAME'),
  }),
  inject: [ConfigService],
  // filter/interceptor must be specified separately at the registerAsync() call site.
  // (They determine whether APP_FILTER/APP_INTERCEPTOR are registered on the
  //  DynamicModule, so they're fixed at registration time regardless of the
  //  async factory's result.)
  filter: true,
  interceptor: { slowThreshold: 2000 },
});
```

## Sending custom messages directly

Inject `DicoshotService` to send Discord messages from anywhere in your code.

### sendCustom() — convenience method

```typescript
@Injectable()
export class DeployService {
  constructor(private readonly dicoshot: DicoshotService) {}

  async onDeployComplete(version: string) {
    await this.dicoshot.sendCustom({
      title: 'Deploy complete',
      description: `v${version} deployed successfully`,
      color: 'success', // 'success' | 'danger' | 'warning' | 'info'
    });
  }
}
```

Color presets:

| Value       | Color  |
| ----------- | ------ |
| `'success'` | Green  |
| `'danger'`  | Red    |
| `'warning'` | Yellow |
| `'info'`    | Blue   |

You can also specify a hex value directly: `color: 0xFF0000`

### send() — raw method

Build the Discord embed structure yourself and send it.

```typescript
await this.dicoshot.send({
  embeds: [
    {
      title: 'Notification',
      description: '...',
      color: 0x57f287,
      fields: [{ name: 'Version', value: 'v1.2.3', inline: true }],
    },
  ],
});
```

> Both methods throw on failure. Handle them with try/catch.

## Automatic exception notifications (`filter`)

Enabling the `filter` option registers `DicoshotExceptionFilter` as a global `APP_FILTER`, sending every unhandled exception to Discord. Non-HTTP contexts (WebSocket, RPC, etc.) are ignored and not notified.

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  applicationName: 'order-service',
  filter: true, // or a FilterOptions object
});
```

### FilterOptions

| Key              | Default | Description                                                                        |
| ---------------- | ------- | ------------------------------------------------------------------------------------ |
| `ignore`         | -       | Array of HTTP status codes to skip notifying (e.g. `[404]`)                        |
| `environment`    | -       | Only notify in this environment (`string` or `string[]`, based on `NODE_ENV`)       |
| `mention`        | -       | Mention string to add to the embed body (e.g. `'<@&ROLE_ID>'`)                     |
| `throttle`       | -       | Suppress repeated notifications for the same error (class+method+path) for N seconds |
| `includeStack`   | `true`  | Whether to include the stack trace                                                  |
| `includeRequest` | `true`  | Whether to include the request body                                                 |

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  filter: {
    ignore: [404, 401],
    environment: 'production',
    mention: '<@&123456789012345678>',
    throttle: 60, // notify the same error at most once every 60 seconds
  },
});
```

Error notifications are sent to `webhooks.error` if configured, otherwise to the default `webhookUrl`.

## Slow response / error notifications (`interceptor`)

Enabling the `interceptor` option registers `DicoshotInterceptor` as a global `APP_INTERCEPTOR`, notifying Discord when response time exceeds the threshold. When `filter` is not enabled, the interceptor also handles error notifications (when `filter` is enabled, the interceptor skips error notifications to avoid duplicates).

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  interceptor: true, // or an InterceptorOptions object
});
```

### InterceptorOptions

| Key             | Default | Description                                                          |
| --------------- | ------- | ---------------------------------------------------------------------- |
| `slowThreshold` | `3000`  | Threshold (ms) for considering a response slow                       |
| `excludePaths`  | -       | Array of path prefixes excluded from notifications (e.g. `['/health']`) |
| `onlyErrors`    | `false` | If `true`, disables slow response notifications and only sends error notifications |

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  interceptor: {
    slowThreshold: 1500,
    excludePaths: ['/health', '/metrics'],
  },
});
```

Slow response notifications are sent to `webhooks.slow` if configured, otherwise to the default `webhookUrl`.

## Webhook retry (`retry`)

If a webhook delivery fails (network error, Discord 5xx, rate limit, etc.), it's retried with exponential backoff. If Discord returns `429` with a `Retry-After` header, that value takes priority; otherwise the wait is `backoffMs * 2^attempt`.

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  retry: true, // or a RetryOptions object. Disabled by default (no retries)
});
```

### RetryOptions

| Key         | Default | Description                                                        |
| ----------- | ------- | -------------------------------------------------------------------- |
| `attempts`  | `2`     | Number of retries after the initial attempt fails                  |
| `backoffMs` | `500`   | Wait time (ms) before the first retry. Doubles on each subsequent attempt |

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  retry: { attempts: 3, backoffMs: 300 },
});
```

If all retries fail, the final error is propagated to the caller. `DicoshotListener`/`DicoshotExceptionFilter`/`DicoshotInterceptor` catch this error and only emit a WARN log, so it doesn't affect app behavior.

## Configuration

| Key                | Default      | Description                                                                             |
| ------------------ | ------------ | ----------------------------------------------------------------------------------------- |
| `webhookUrl`       | **(required)** | Discord webhook URL. Auto-disabled if not set                                          |
| `enabled`          | `true`       | Global enable toggle (applies to startup/shutdown notifications)                       |
| `notifyOnStartup`  | `true`       | Whether to send a startup notification                                                 |
| `notifyOnShutdown` | `true`       | Whether to send a shutdown notification                                                |
| `applicationName`  | -            | Service name shown in the embed                                                        |
| `username`         | -            | Override for the webhook bot's display name                                            |
| `timeoutMs`        | `5000`       | HTTP timeout (ms)                                                                       |
| `webhooks.error`   | -            | Dedicated webhook URL for exception notifications (falls back to `webhookUrl`)         |
| `webhooks.slow`    | -            | Dedicated webhook URL for slow response notifications (falls back to `webhookUrl`)     |
| `filter`           | `false`      | Enable automatic exception notifications (`boolean` or [`FilterOptions`](#filteroptions)) |
| `interceptor`      | `false`      | Enable slow response/error notifications (`boolean` or [`InterceptorOptions`](#interceptoroptions)) |
| `retry`            | `false`      | Enable retries on webhook delivery failure (`boolean` or [`RetryOptions`](#retryoptions)) |

### Example: notify only on startup

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  notifyOnShutdown: false,
  applicationName: 'order-service',
  username: 'Dicoshot Bot',
});
```

### Example: separate channels for errors and slow responses

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL, // for startup/shutdown notifications
  webhooks: {
    error: process.env.DISCORD_ERROR_WEBHOOK_URL, // for exception notifications
    slow: process.env.DISCORD_SLOW_WEBHOOK_URL, // for slow response notifications
  },
  filter: { environment: 'production' },
  interceptor: { slowThreshold: 2000 },
});
```

### Example: inject the webhook URL via an environment variable

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL ?? '',
});
```

If the value is empty, the SDK is automatically disabled, so no errors occur in local development.

## How it works

1. `DicoshotModule.register()`/`registerAsync()` registers the options in the NestJS DI container.
2. If the `filter`/`interceptor` options are enabled, they're registered globally as `APP_FILTER`/`APP_INTERCEPTOR` respectively.
3. `DicoshotListener` subscribes to NestJS lifecycle hooks and sends startup/shutdown messages at `onApplicationBootstrap()`/`onApplicationShutdown()`.
4. When an exception occurs during request handling, `DicoshotExceptionFilter` (or `DicoshotInterceptor` if `filter` is disabled) sends an error message.
5. When response time exceeds `slowThreshold`, `DicoshotInterceptor` sends a slow response message.
6. Every webhook call swallows its own exceptions and only emits a WARN log on failure, so app behavior is never affected.

## MSA environments

- Each service uses `dicoshot-nest` independently.
- `applicationName` and `hostname` are automatically included in messages, making it easy to identify which service and which instance sent them.
- In environments with frequent pod restarts (e.g. K8s), you can disable only startup notifications with `notifyOnStartup: false`, or disable everything with `enabled: false`.
- Configure `filter.throttle` per service to keep a repeated error from flooding the Discord channel.

## Requirements

- Node.js 18+
- NestJS 10+

## Build

```bash
# Build everything
npm run build --workspaces

# Build individually
cd dicoshot-core && npm run build
cd dicoshot-nest && npm run build
```

## Out of scope (current version)

The following features are not yet included.

- Asynchronous queueing (persisting messages that fail permanently beyond retries)
- Simultaneous delivery to multiple webhooks or other platforms like Slack

## License

[MIT License](LICENSE) © 2026 DicoShot
