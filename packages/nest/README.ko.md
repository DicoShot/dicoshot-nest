# dicoshot-nest

[English](README.md) | 한국어

NestJS 애플리케이션의 시작/종료, 예외 발생, 느린 응답을 Discord 채널로 자동 알림하는 SDK입니다. 모듈 등록만으로 동작합니다.

## 특징

- **자동 알림**: `OnApplicationBootstrap`/`OnApplicationShutdown` 훅으로 별도 코드 없이 시작/종료 알림
- **예외 자동 알림**: 전역 `ExceptionFilter`로 처리되지 않은 예외를 Discord로 즉시 전송 (스택트레이스, 요청 바디 포함 가능), 에러가 발생한 정확한 위치(`file:line:col`)를 별도의 `Location` 필드로 표시
- **느린 응답 알림**: `NestInterceptor`로 응답 시간이 임계값을 초과하면 알림
- **커스텀 메시지**: `DicoshotService`를 주입받아 임의의 타이밍에 Discord 메시지 직접 발송, 또는 `@DicoshotNotify()`로 핸들러 성공 시 자동 발송
- **장애 격리**: webhook 전송 실패가 앱 기동/종료/요청 처리를 막지 않음 (WARN 로그만 출력)
- **MSA 친화**: hostname과 applicationName이 메시지에 자동 포함되어 인스턴스 구분 용이
- **환경 자동 감지**: `NODE_ENV`, `npm_package_version` 자동 포함
- **중복 알림 방지**: 필터와 인터셉터를 동시에 사용해도 같은 에러가 두 번 알림되지 않음
- **알림 언어 선택**: `locale` 옵션으로 알림 제목/필드 이름(Service, Environment, Status, Location 등)을 영어·한국어·일본어·중국어로 발송 — 그 외 언어도 직접 번역을 넘겨서 사용 가능

## 모듈 구성

| 모듈            | 설명                                                                |
| --------------- | ------------------------------------------------------------------- |
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
});
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
      color: 'success', // 'success' | 'danger' | 'warning' | 'info'
      fields: [{ name: '버전', value: `v${version}`, inline: true }],
      mention: '<@&123456789012345678>', // Discord content 필드로 전송되어 실제 멘션 알림이 울림
    });
  }
}
```

색상 프리셋:

| 값          | 색상   |
| ----------- | ------ |
| `'success'` | 녹색   |
| `'danger'`  | 빨간색 |
| `'warning'` | 노란색 |
| `'info'`    | 파란색 |

hex 값을 직접 지정할 수도 있습니다: `color: 0xFF0000`

### send() — raw 메서드

Discord embed 구조를 직접 구성해서 발송합니다.

```typescript
await this.dicoshot.send({
  embeds: [
    {
      title: '알림',
      description: '...',
      color: 0x57f287,
      fields: [{ name: '버전', value: 'v1.2.3', inline: true }],
    },
  ],
});
```

> 두 메서드 모두 에러를 throw하지 않습니다. 전송 성공 여부를 나타내는 `boolean`을 반환하며, 실패 시에는 SDK의 다른 부분과 동일하게 WARN 로그만 남깁니다.

### `@DicoshotNotify()` — 데코레이터

컨트롤러(또는 Nest 파이프라인을 거치는 모든 핸들러)에 데코레이터를 붙이면, 해당 핸들러가 성공적으로 끝났을 때 커스텀 메시지를 자동으로 전송합니다. `@UseInterceptors()`를 따로 설정할 필요 없이, 인터셉터가 전역으로 등록되어 데코레이터가 없는 핸들러에서는 아무 동작도 하지 않습니다. 핸들러가 예외를 던지면 메시지를 보내지 않습니다(에러 알림은 `filter`/`interceptor`를 사용하세요).

```typescript
@Controller('orders')
export class OrderController {
  @Post()
  @DicoshotNotify({ title: '새 주문 생성', color: 'success' })
  create(@Body() dto: CreateOrderDto) {
    return this.orderService.create(dto);
  }

  @Post(':id/deploy')
  @DicoshotNotify({
    title: (args) => `배포 완료: ${args[0]}`, // args = 핸들러 인자 배열, 순서대로
    description: (_args, result) => `결과: ${JSON.stringify(result)}`,
    color: 'success',
  })
  deploy(@Param('id') id: string) {
    return this.orderService.deploy(id);
  }
}
```

`title`/`description`은 고정 문자열 또는 `(args, result) => string` 형태의 함수를 받을 수 있습니다. `args`는 핸들러의 인자 배열, `result`는 반환값입니다.

> `mention`은 `@DicoshotNotify()`에서 지원하지 않습니다. 멘션이 필요하면 `DicoshotService.sendCustom()`을 직접 사용하세요.

## 예외 자동 알림 (`filter`)

`filter` 옵션을 켜면 `DicoshotExceptionFilter`가 전역 `APP_FILTER`로 등록됩니다. 기본적으로 처리되지 않은 예외와 HTTP status `500` 이상인 에러만 Discord로 전송합니다(`NotFoundException` 같은 4xx `HttpException`은 `minStatus`를 낮추지 않으면 알림하지 않습니다). HTTP 컨텍스트가 아닌 경우(WebSocket, RPC 등)는 알림하지 않고 무시합니다.

스택트레이스를 사용할 수 있는 경우, 에러가 실제로 던져진 `file:line:col`을 스택의 맨 위 프레임에서 뽑아 `Location` 필드로 따로 보여줍니다 — 전체 `Stack Trace` 블록을 다 읽지 않아도 바로 위치를 확인할 수 있습니다.

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  applicationName: 'order-service',
  filter: true, // 또는 FilterOptions 객체
});
```

Discord에는 이런 형태로 도착합니다:

> 🚨 **[production] order-service — TypeError**
> `Cannot read properties of undefined (reading 'id')`
>
> **Service** `order-service` **Environment** `production` **Status** `500`
> **Method** `POST` **Path** `/orders`
>
> **Location**
> `/app/src/order/order.service.ts:42:18`
>
> **Request Body**
>
> ```json
> { "productId": "abc123", "quantity": 2 }
> ```
>
> **Stack Trace**
>
> ```
> TypeError: Cannot read properties of undefined (reading 'id')
>     at OrderService.create (/app/src/order/order.service.ts:42:18)
>     at OrderController.create (/app/src/order/order.controller.ts:15:30)
> ```

`Location`은 항상 `Stack Trace`의 맨 첫 줄과 같은 내용입니다 — 전체 스택을 다 안 읽어도 에러가 실제로 어디서 터졌는지 바로 보이도록 따로 빼서 보여주는 필드입니다.

### FilterOptions

| 키               | 기본값 | 설명                                                                       |
| ---------------- | ------ | -------------------------------------------------------------------------- |
| `minStatus`      | `500`  | 이 값 이상인 status 코드만 알림 (처리되지 않은 예외는 항상 `500`으로 취급) |
| `ignore`         | -      | 알림하지 않을 HTTP status 코드 배열 (예: `[404]`)                          |
| `environment`    | -      | 이 환경에서만 알림 (`string` 또는 `string[]`, `NODE_ENV` 기준)             |
| `mention`        | -      | embed 본문에 추가할 멘션 문자열 (예: `'<@&ROLE_ID>'`)                      |
| `throttle`       | -      | 동일 에러(클래스+메서드+경로) 반복 알림을 N초 동안 억제                    |
| `includeStack`   | `true` | 스택트레이스 포함 여부                                                     |
| `includeRequest` | `true` | 요청 바디 포함 여부                                                        |

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  filter: {
    ignore: [404, 401],
    environment: 'production',
    mention: '<@&123456789012345678>',
    throttle: 60, // 같은 에러는 60초에 한 번만 알림
  },
});
```

에러 알림은 `webhooks.error`가 설정되어 있으면 그 URL로, 없으면 기본 `webhookUrl`로 전송됩니다.

## 느린 응답 / 에러 알림 (`interceptor`)

`interceptor` 옵션을 켜면 `DicoshotInterceptor`가 전역 `APP_INTERCEPTOR`로 등록되어, 응답 시간이 임계값을 초과하면 Discord로 알림합니다. `filter`가 켜져 있지 않은 경우에는 에러 알림도 인터셉터가 함께 처리합니다(필터가 켜져 있으면 중복 알림을 막기 위해 인터셉터는 에러 알림을 보내지 않습니다) — 이때도 위에서 설명한 `Location`, `Stack Trace` 필드가 동일하게 포함되며, 에러 발생까지 소요된 시간을 나타내는 `Duration` 필드도 추가됩니다.

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  interceptor: true, // 또는 InterceptorOptions 객체
});
```

### InterceptorOptions

| 키               | 기본값  | 설명                                                                         |
| ---------------- | ------- | ---------------------------------------------------------------------------- |
| `slowThreshold`  | `3000`  | 느린 응답으로 판단할 기준 시간 (ms)                                          |
| `excludePaths`   | -       | 알림에서 제외할 경로 prefix 배열 (예: `['/health']`)                         |
| `onlyErrors`     | `false` | `true`이면 느린 응답 알림은 끄고 에러 알림만 수행                            |
| `minStatus`      | `500`   | 이 값 이상인 status의 에러만 알림 (처리되지 않은 예외는 항상 `500`으로 취급) |
| `includeStack`   | `true`  | 에러 알림에 스택트레이스 포함 여부                                           |
| `includeRequest` | `true`  | 에러 알림에 요청 바디 포함 여부                                              |

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  interceptor: {
    slowThreshold: 1500,
    excludePaths: ['/health', '/metrics'],
  },
});
```

느린 응답 알림은 `webhooks.slow`가 설정되어 있으면 그 URL로, 없으면 기본 `webhookUrl`로 전송됩니다.

## Webhook 재전송 (`retry`)

webhook 전송이 실패하면(네트워크 오류, Discord 5xx, rate limit 등) 지수 백오프로 재시도합니다. Discord가 `429`와 함께 `Retry-After` 헤더를 보내면 그 값을 우선 사용하고, 그 외에는 `backoffMs * 2^시도횟수`로 대기합니다.

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  retry: true, // 또는 RetryOptions 객체. 기본값은 꺼져 있음 (재시도 없음)
});
```

### RetryOptions

| 키          | 기본값 | 설명                                                     |
| ----------- | ------ | -------------------------------------------------------- |
| `attempts`  | `2`    | 최초 시도 실패 후 재시도 횟수                            |
| `backoffMs` | `500`  | 첫 재시도까지의 대기 시간 (ms). 이후 시도마다 2배씩 증가 |

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  retry: { attempts: 3, backoffMs: 300 },
});
```

모든 재시도가 실패하면 최종 에러가 호출자에게 전달됩니다. `DicoshotListener`/`DicoshotExceptionFilter`/`DicoshotInterceptor`는 이 에러를 잡아 WARN 로그만 남기므로 앱 동작에는 영향이 없습니다.

## 설정

| 키                 | 기본값  | 설명                                                                                                                        |
| ------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `webhookUrl`       | -       | Discord Webhook URL. 미설정 시 자동 비활성화                                                                                |
| `enabled`          | `true`  | 전체 활성화 토글 (시작/종료 알림에 적용)                                                                                    |
| `notifyOnStartup`  | `true`  | 시작 알림 발송 여부                                                                                                         |
| `notifyOnShutdown` | `true`  | 종료 알림 발송 여부                                                                                                         |
| `applicationName`  | -       | embed에 표시될 서비스 이름                                                                                                  |
| `locale`           | `'en'`  | 알림 제목/필드 이름 언어: `'en'` \| `'ko'` \| `'ja'` \| `'zh'`, 또는 직접 만든 [`DicoshotMessages`](#예시-커스텀-언어) 객체 |
| `timeoutMs`        | `5000`  | HTTP 타임아웃 (ms)                                                                                                          |
| `webhooks.error`   | -       | 예외 알림 전용 webhook URL (없으면 `webhookUrl` 사용)                                                                       |
| `webhooks.slow`    | -       | 느린 응답 알림 전용 webhook URL (없으면 `webhookUrl` 사용)                                                                  |
| `filter`           | `false` | 예외 자동 알림 활성화 (`boolean` 또는 [`FilterOptions`](#filteroptions))                                                    |
| `interceptor`      | `false` | 느린 응답/에러 알림 활성화 (`boolean` 또는 [`InterceptorOptions`](#interceptoroptions))                                     |
| `retry`            | `false` | webhook 전송 실패 시 재시도 활성화 (`boolean` 또는 [`RetryOptions`](#retryoptions))                                         |

### 예시: 시작 시에만 알림

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  notifyOnShutdown: false,
  applicationName: 'order-service',
});
```

### 예시: 다른 언어로 알림 받기

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  applicationName: '주문-서비스',
  locale: 'ko', // 'en' | 'ko' | 'ja' | 'zh'
});
```

제목과 필드 이름(Service, Environment, Status, Location 등)이 번역됩니다. 런타임에서 가져오는 값들 — 예외 클래스 이름(`TypeError`, `NotFoundException` 등), 에러 메시지, 스택 트레이스, 요청 경로 — 은 그대로 전송되며 번역되지 않습니다.

### 예시: 커스텀 언어

팀 사용자들이 내장 언어를 안 쓴다면, locale 코드 대신 `DicoshotMessages` 객체를 통째로 넘기면 모든 제목/필드 이름이 그 객체 값으로 대체됩니다.

```typescript
import { DicoshotMessages } from 'dicoshot-nest';

const fr: DicoshotMessages = {
  startupTitle: '🟢 Application démarrée',
  shutdownTitle: '🔴 Application arrêtée',
  slowResponseLabel: 'Réponse lente',
  field: {
    service: 'Service',
    environment: 'Environnement',
    version: 'Version',
    hostname: 'Hôte',
    time: 'Heure',
    status: 'Statut',
    method: 'Méthode',
    path: 'Chemin',
    duration: 'Durée',
    location: 'Emplacement',
    stackTrace: "Pile d'appels",
    requestBody: 'Corps de la requête',
  },
};

DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  locale: fr,
});
```

### 예시: 에러/느린 응답을 다른 채널로 분리

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL, // 시작/종료 알림용
  webhooks: {
    error: process.env.DISCORD_ERROR_WEBHOOK_URL, // 예외 알림용
    slow: process.env.DISCORD_SLOW_WEBHOOK_URL, // 느린 응답 알림용
  },
  filter: { environment: 'production' },
  interceptor: { slowThreshold: 2000 },
});
```

### 예시: 환경 변수로 webhook URL 주입

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
});
```

`webhookUrl`은 선택값입니다 — 비어있거나 설정하지 않으면 자동으로 비활성화되어 로컬 개발 환경에서 오류가 발생하지 않습니다.

## 동작 방식

1. `DicoshotModule.register()`/`registerAsync()`로 옵션을 NestJS DI 컨테이너에 등록합니다.
2. `DicoshotNotifyInterceptor`는 항상 `APP_INTERCEPTOR`로 전역 등록되며, `@DicoshotNotify()`가 붙은 핸들러가 아니면 아무 동작도 하지 않습니다. `filter`/`interceptor` 옵션이 켜져 있으면 `DicoshotExceptionFilter`/`DicoshotInterceptor`도 각각 `APP_FILTER`/`APP_INTERCEPTOR`로 전역 등록됩니다.
3. `DicoshotListener`가 NestJS 라이프사이클 훅을 구독해 `onApplicationBootstrap()`/`onApplicationShutdown()` 시점에 시작/종료 메시지를 발송합니다.
4. 요청 처리 중 예외가 발생하면 `DicoshotExceptionFilter`(또는 `filter`가 꺼져 있을 때는 `DicoshotInterceptor`)가 에러 메시지를 발송합니다.
5. 응답 시간이 `slowThreshold`를 초과하면 `DicoshotInterceptor`가 느린 응답 메시지를 발송합니다.
6. `@DicoshotNotify()`가 붙은 핸들러가 성공적으로 끝나면 `DicoshotNotifyInterceptor`가 설정된 커스텀 메시지를 발송합니다.
7. 모든 webhook 호출은 실패해도 예외를 삼키고 WARN 로그만 남기므로 앱 동작에 영향을 주지 않습니다.

## MSA 환경

- 각 서비스가 `dicoshot-nest`를 독립적으로 사용합니다.
- 메시지에 `applicationName`과 `hostname`이 자동 포함되어 어느 서비스의 어느 인스턴스인지 식별 가능합니다.
- K8s 등에서 Pod 재시작이 잦은 경우 `notifyOnStartup: false`로 시작 알림만 끄거나, `enabled: false`로 전체 비활성화할 수 있습니다.
- 서비스별로 `filter.throttle`을 설정해 동일 에러가 반복 발생해도 Discord 채널이 도배되지 않도록 할 수 있습니다.

## 요구사항

- Node.js 20 이상
- NestJS 10 또는 11

## 빌드

```bash
# 전체 빌드
pnpm build

# 개별 빌드
pnpm --filter dicoshot-core build
pnpm --filter dicoshot-nest build
```

## 범위 외 (현재 버전)

다음 기능은 아직 포함되지 않습니다.

- 비동기 큐잉 (재시도 외 영구 실패 메시지 보관)
- 다중 webhook 동시 발송 또는 Slack 등 타 플랫폼

## License

[MIT License](LICENSE) © 2026 DicoShot
