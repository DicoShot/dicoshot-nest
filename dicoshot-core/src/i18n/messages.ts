export type Locale = 'en' | 'ko' | 'ja' | 'zh';

export interface DicoshotMessages {
  startupTitle: string;
  shutdownTitle: string;
  slowResponseLabel: string;
  field: {
    service: string;
    environment: string;
    version: string;
    hostname: string;
    time: string;
    status: string;
    method: string;
    path: string;
    duration: string;
    location: string;
    stackTrace: string;
    requestBody: string;
  };
}

const MESSAGES: Record<Locale, DicoshotMessages> = {
  en: {
    startupTitle: '🟢 Application Started',
    shutdownTitle: '🔴 Application Stopped',
    slowResponseLabel: 'Slow Response',
    field: {
      service: 'Service',
      environment: 'Environment',
      version: 'Version',
      hostname: 'Hostname',
      time: 'Time',
      status: 'Status',
      method: 'Method',
      path: 'Path',
      duration: 'Duration',
      location: 'Location',
      stackTrace: 'Stack Trace',
      requestBody: 'Request Body',
    },
  },
  ko: {
    startupTitle: '🟢 애플리케이션 시작',
    shutdownTitle: '🔴 애플리케이션 종료',
    slowResponseLabel: '느린 응답',
    field: {
      service: '서비스',
      environment: '환경',
      version: '버전',
      hostname: '호스트명',
      time: '시간',
      status: '상태',
      method: '메서드',
      path: '경로',
      duration: '소요 시간',
      location: '발생 위치',
      stackTrace: '스택 트레이스',
      requestBody: '요청 바디',
    },
  },
  ja: {
    startupTitle: '🟢 アプリケーション起動',
    shutdownTitle: '🔴 アプリケーション停止',
    slowResponseLabel: '遅延レスポンス',
    field: {
      service: 'サービス',
      environment: '環境',
      version: 'バージョン',
      hostname: 'ホスト名',
      time: '時刻',
      status: 'ステータス',
      method: 'メソッド',
      path: 'パス',
      duration: '処理時間',
      location: '発生箇所',
      stackTrace: 'スタックトレース',
      requestBody: 'リクエストボディ',
    },
  },
  zh: {
    startupTitle: '🟢 应用已启动',
    shutdownTitle: '🔴 应用已停止',
    slowResponseLabel: '响应缓慢',
    field: {
      service: '服务',
      environment: '环境',
      version: '版本',
      hostname: '主机名',
      time: '时间',
      status: '状态',
      method: '方法',
      path: '路径',
      duration: '耗时',
      location: '发生位置',
      stackTrace: '堆栈信息',
      requestBody: '请求体',
    },
  },
};

// 예외 클래스 이름(TypeError 등)처럼 런타임 값인 부분은 번역 대상이 아니므로 그대로 둔다.
// 내장 언어 외 다른 언어가 필요하면 DicoshotMessages 객체를 통째로 넘겨 직접 번역을 지정할 수 있다.
export function getMessages(locale: Locale | DicoshotMessages | undefined): DicoshotMessages {
  if (locale && typeof locale === 'object') return locale;
  return MESSAGES[locale ?? 'en'];
}
