# dicoshot-nest

NestJS 애플리케이션의 시작/종료, 예외 발생, 느린 응답을 Discord 채널로 자동 알림하는 SDK입니다. 모듈 등록만으로 동작합니다.

## 특징

- **자동 알림**: `OnApplicationBootstrap`/`OnApplicationShutdown` 훅으로 별도 코드 없이 시작/종료 알림
- **예외 자동 알림**: 전역 `ExceptionFilter`로 처리되지 않은 예외를 Discord로 즉시 전송 (스택트레이스, 요청 바디 포함 가능)
- **느린 응답 알림**: `NestInterceptor`로 응답 시간이 임계값을 초과하면 알림
- **커스텀 메시지**: `DicoshotService`를 주입받아 임의의 타이밍에 Discord 메시지 직접 발송 가능
- **장애 격리**: webhook 전송 실패가 앱 기동/종료/요청 처리를 막지 않음 (WARN 로그만 출력)
- **MSA 친화**: hostname과 applicationName이 메시지에 자동 포함되어 인스턴스 구분 용이
- **환경 자동 감지**: `NODE_ENV`, `npm_package_version` 자동 포함
- **중복 알림 방지**: 필터와 인터셉터를 동시에 사용해도 같은 에러가 두 번 알림되지 않음

## 모듈 구성

| 모듈 | 설명 |
|------|------|
| `dicoshot-core` | NestJS 의존성 없는 순수 TypeScript. 메시지 모델, Webhook 클라이언트 |
| `dicoshot-nest` | NestJS DynamicModule, 라이프사이클 훅, ExceptionFilter, Interceptor |

## 설치

```bash
npm install dicoshot-nest
```

## 빠른 시작

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

앱을 실행하면 Discord 채널에 다음과 같은 embed가 도착합니다.

- **시작 시**: 녹색 embed, 제목 "🟢 Application Started", 서비스명/환경/버전/hostname/시간 포함
- **종료 시**: 빨간 embed, 제목 "🔴 Application Stopped"

## ConfigService 연동

```typescript
DicoshotModule.registerAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    webhookUrl: config.get('DISCORD_WEBHOOK_URL'),
    applicationName: config.get('APP_NAME'),
  }),
  inject: [ConfigService],
  // filter/interceptor는 registerAsync 호출 시점에 별도로 지정합니다.
  // (DynamicModule의 APP_FILTER/APP_INTERCEPTOR 등록 여부를 결정하기 때문에
  //  비동기 팩토리 결과와 무관하게 등록 시점 값으로 고정됩니다)
  filter: true,
  interceptor: { slowThreshold: 2000 },
})
```

## 커스텀 메시지 직접 발송

`DicoshotService`를 주입받아 코드 어디서든 Discord 메시지를 발송할 수 있습니다.

### sendCustom() — 편의 메서드

```typescript
@Injectable()
export class DeployService {
  constructor(private readonly dicoshot: DicoshotService) {}

  async onDeployComplete(version: string) {
    await this.dicoshot.sendCustom({
      title: '배포 완료',
      description: `v${version} 정상 배포`,
      color: 'success',   // 'success' | 'danger' | 'warning' | 'info'
    });
  }
}
```

색상 프리셋:

| 값 | 색상 |
|----|------|
| `'success'` | 녹색 |
| `'danger'` | 빨간색 |
| `'warning'` | 노란색 |
| `'info'` | 파란색 |

hex 값을 직접 지정할 수도 있습니다: `color: 0xFF0000`

### send() — raw 메서드

Discord embed 구조를 직접 구성해서 발송합니다.

```typescript
await this.dicoshot.send({
  embeds: [{
    title: '알림',
    description: '...',
    color: 0x57F287,
    fields: [{ name: '버전', value: 'v1.2.3', inline: true }],
  }],
});
```

> 두 메서드 모두 실패 시 에러를 throw합니다. try/catch로 처리하세요.

## 예외 자동 알림 (`filter`)

`filter` 옵션을 켜면 `DicoshotExceptionFilter`가 전역 `APP_FILTER`로 등록되어, 처리되지 않은 모든 예외를 Discord로 전송합니다. HTTP 컨텍스트가 아닌 경우(WebSocket, RPC 등)는 알림하지 않고 무시합니다.

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  applicationName: 'order-service',
  filter: true, // 또는 FilterOptions 객체
})
```

### FilterOptions

| 키 | 기본값 | 설명 |
|----|--------|------|
| `ignore` | - | 알림하지 않을 HTTP status 코드 배열 (예: `[404]`) |
| `environment` | - | 이 환경에서만 알림 (`string` 또는 `string[]`, `NODE_ENV` 기준) |
| `mention` | - | embed 본문에 추가할 멘션 문자열 (예: `'<@&ROLE_ID>'`) |
| `throttle` | - | 동일 에러(클래스+메서드+경로) 반복 알림을 N초 동안 억제 |
| `includeStack` | `true` | 스택트레이스 포함 여부 |
| `includeRequest` | `true` | 요청 바디 포함 여부 |

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  filter: {
    ignore: [404, 401],
    environment: 'production',
    mention: '<@&123456789012345678>',
    throttle: 60, // 같은 에러는 60초에 한 번만 알림
  },
})
```

에러 알림은 `webhooks.error`가 설정되어 있으면 그 URL로, 없으면 기본 `webhookUrl`로 전송됩니다.

## 느린 응답 / 에러 알림 (`interceptor`)

`interceptor` 옵션을 켜면 `DicoshotInterceptor`가 전역 `APP_INTERCEPTOR`로 등록되어, 응답 시간이 임계값을 초과하면 Discord로 알림합니다. `filter`가 켜져 있지 않은 경우에는 에러 알림도 인터셉터가 함께 처리합니다(필터가 켜져 있으면 중복 알림을 막기 위해 인터셉터는 에러 알림을 보내지 않습니다).

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  interceptor: true, // 또는 InterceptorOptions 객체
})
```

### InterceptorOptions

| 키 | 기본값 | 설명 |
|----|--------|------|
| `slowThreshold` | `3000` | 느린 응답으로 판단할 기준 시간 (ms) |
| `excludePaths` | - | 알림에서 제외할 경로 prefix 배열 (예: `['/health']`) |
| `onlyErrors` | `false` | `true`이면 느린 응답 알림은 끄고 에러 알림만 수행 |

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  interceptor: {
    slowThreshold: 1500,
    excludePaths: ['/health', '/metrics'],
  },
})
```

느린 응답 알림은 `webhooks.slow`가 설정되어 있으면 그 URL로, 없으면 기본 `webhookUrl`로 전송됩니다.

## 설정

| 키 | 기본값 | 설명 |
|----|--------|------|
| `webhookUrl` | **(필수)** | Discord Webhook URL. 미설정 시 자동 비활성화 |
| `enabled` | `true` | 전체 활성화 토글 (시작/종료 알림에 적용) |
| `notifyOnStartup` | `true` | 시작 알림 발송 여부 |
| `notifyOnShutdown` | `true` | 종료 알림 발송 여부 |
| `applicationName` | - | embed에 표시될 서비스 이름 |
| `username` | - | webhook bot의 표시 이름 override |
| `timeoutMs` | `5000` | HTTP 타임아웃 (ms) |
| `webhooks.error` | - | 예외 알림 전용 webhook URL (없으면 `webhookUrl` 사용) |
| `webhooks.slow` | - | 느린 응답 알림 전용 webhook URL (없으면 `webhookUrl` 사용) |
| `filter` | `false` | 예외 자동 알림 활성화 (`boolean` 또는 [`FilterOptions`](#filteroptions)) |
| `interceptor` | `false` | 느린 응답/에러 알림 활성화 (`boolean` 또는 [`InterceptorOptions`](#interceptoroptions)) |

### 예시: 시작 시에만 알림

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  notifyOnShutdown: false,
  applicationName: 'order-service',
  username: 'Dicoshot Bot',
})
```

### 예시: 에러/느린 응답을 다른 채널로 분리

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,        // 시작/종료 알림용
  webhooks: {
    error: process.env.DISCORD_ERROR_WEBHOOK_URL,      // 예외 알림용
    slow: process.env.DISCORD_SLOW_WEBHOOK_URL,         // 느린 응답 알림용
  },
  filter: { environment: 'production' },
  interceptor: { slowThreshold: 2000 },
})
```

### 예시: 환경 변수로 webhook URL 주입

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL ?? '',
})
```

값이 비어있으면 자동으로 비활성화되어 로컬 개발 환경에서 오류가 발생하지 않습니다.

## 동작 방식

1. `DicoshotModule.register()`/`registerAsync()`로 옵션을 NestJS DI 컨테이너에 등록합니다.
2. `filter`/`interceptor` 옵션이 켜져 있으면 각각 `APP_FILTER`/`APP_INTERCEPTOR`로 전역 등록됩니다.
3. `DicoshotListener`가 NestJS 라이프사이클 훅을 구독해 `onApplicationBootstrap()`/`onApplicationShutdown()` 시점에 시작/종료 메시지를 발송합니다.
4. 요청 처리 중 예외가 발생하면 `DicoshotExceptionFilter`(또는 `filter`가 꺼져 있을 때는 `DicoshotInterceptor`)가 에러 메시지를 발송합니다.
5. 응답 시간이 `slowThreshold`를 초과하면 `DicoshotInterceptor`가 느린 응답 메시지를 발송합니다.
6. 모든 webhook 호출은 실패해도 예외를 삼키고 WARN 로그만 남기므로 앱 동작에 영향을 주지 않습니다.

## MSA 환경

- 각 서비스가 `dicoshot-nest`를 독립적으로 사용합니다.
- 메시지에 `applicationName`과 `hostname`이 자동 포함되어 어느 서비스의 어느 인스턴스인지 식별 가능합니다.
- K8s 등에서 Pod 재시작이 잦은 경우 `notifyOnStartup: false`로 시작 알림만 끄거나, `enabled: false`로 전체 비활성화할 수 있습니다.
- 서비스별로 `filter.throttle`을 설정해 동일 에러가 반복 발생해도 Discord 채널이 도배되지 않도록 할 수 있습니다.

## 요구사항

- Node.js 18 이상
- NestJS 10 이상

## 빌드

```bash
# 전체 빌드
npm run build --workspaces

# 개별 빌드
cd dicoshot-core && npm run build
cd dicoshot-nest && npm run build
```

## 범위 외 (현재 버전)

다음 기능은 아직 포함되지 않습니다.

- 재시도, 백오프, 비동기 큐잉
- 다중 webhook 동시 발송 또는 Slack 등 타 플랫폼

## License

[MIT License](LICENSE) © 2026 DicoShot
