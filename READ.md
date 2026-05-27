# dicoshot-nest

NestJS 애플리케이션이 시작/종료될 때 Discord 채널로 알림을 자동 발송하는 SDK입니다. 모듈 등록만으로 동작합니다.

## 특징

- **자동 알림**: `OnApplicationBootstrap`과 `OnApplicationShutdown` 훅을 사용하여 별도 코드 없이 동작
- **장애 격리**: webhook 전송 실패가 앱 기동/종료를 막지 않음 (WARN 로그만 출력)
- **MSA 친화**: hostname과 applicationName이 메시지에 자동 포함되어 인스턴스 구분 용이
- **환경 자동 감지**: `NODE_ENV`, `npm_package_version` 자동 포함

## 모듈 구성

| 모듈 | 설명 |
|------|------|
| `dicoshot-core` | NestJS 의존성 없는 순수 TypeScript. 메시지 모델, Webhook 클라이언트 |
| `dicoshot-nest` | NestJS DynamicModule, 라이프사이클 훅 |

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

- **시작 시**: 녹색 embed, 제목 "Application Started", 서비스명/환경/버전/hostname/시간 포함
- **종료 시**: 빨간 embed, 제목 "Application Shutdown"

## ConfigService 연동

```typescript
DicoshotModule.registerAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    webhookUrl: config.get('DISCORD_WEBHOOK_URL'),
    applicationName: config.get('APP_NAME'),
  }),
  inject: [ConfigService],
})
```

## 설정

| 키 | 기본값 | 설명 |
|----|--------|------|
| `webhookUrl` | **(필수)** | Discord Webhook URL. 미설정 시 자동 비활성화 |
| `enabled` | `true` | 전체 활성화 토글 |
| `notifyOnStartup` | `true` | 시작 알림 발송 여부 |
| `notifyOnShutdown` | `true` | 종료 알림 발송 여부 |
| `applicationName` | - | embed에 표시될 서비스 이름 |
| `username` | - | webhook bot의 표시 이름 override |
| `timeoutMs` | `5000` | HTTP 타임아웃 (ms) |

### 예시: 시작 시에만 알림

```typescript
DicoshotModule.register({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  notifyOnShutdown: false,
  applicationName: 'order-service',
  username: 'Dicoshot Bot',
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

1. `DicoshotModule.register()`로 옵션을 NestJS DI 컨테이너에 등록합니다.
2. `DicoshotListener`가 NestJS 라이프사이클 훅을 구독합니다.
3. `onApplicationBootstrap()` 수신 시 startup 메시지를, `onApplicationShutdown()` 수신 시 shutdown 메시지를 발송합니다.
4. webhook 호출이 실패해도 예외는 삼키고 WARN 로그만 남기므로 앱 기동/종료가 영향을 받지 않습니다.

## MSA 환경

- 각 서비스가 `dicoshot-nest`를 독립적으로 사용합니다.
- 메시지에 `applicationName`과 `hostname`이 자동 포함되어 어느 서비스의 어느 인스턴스인지 식별 가능합니다.
- K8s 등에서 Pod 재시작이 잦은 경우 `notifyOnStartup: false`로 시작 알림만 끄거나, `enabled: false`로 전체 비활성화할 수 있습니다.

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

다음 기능은 v0.1에 포함되지 않습니다.

- 예외/에러 발생 시 자동 알림
- 재시도, 백오프, 비동기 큐잉
- 다중 webhook 또는 Slack 등 타 플랫폼
- 커스텀 메시지 직접 발송 (`DicoshotService` 주입)

## License

MIT License © 2026 DicoShot