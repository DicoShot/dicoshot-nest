import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { of, throwError } from 'rxjs';

import { DicoshotNotifyOptions } from '../decorators/dicoshot-notify.decorator';
import { DicoshotService } from '../dicoshot.service';
import { DicoshotNotifyInterceptor } from './dicoshot-notify.interceptor';

function createContext(args: unknown[] = []): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getArgs: () => args,
  } as unknown as ExecutionContext;
}

function createCallHandler(observable: ReturnType<typeof of>): CallHandler {
  return { handle: () => observable } as CallHandler;
}

describe('DicoshotNotifyInterceptor', () => {
  let reflector: { get: jest.Mock };
  let dicoshot: { sendCustom: jest.Mock };
  let interceptor: DicoshotNotifyInterceptor;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    dicoshot = { sendCustom: jest.fn().mockResolvedValue(undefined) };
    interceptor = new DicoshotNotifyInterceptor(
      reflector as unknown as Reflector,
      dicoshot as unknown as DicoshotService,
    );
  });

  it('@DicoshotNotify가 없으면 sendCustom을 호출하지 않는다', async () => {
    reflector.get.mockReturnValue(undefined);
    const result$ = interceptor.intercept(createContext(), createCallHandler(of('ok')));

    await new Promise((resolve) => result$.subscribe({ complete: resolve }));

    expect(dicoshot.sendCustom).not.toHaveBeenCalled();
  });

  it('정적 title/description으로 핸들러 성공 시 sendCustom을 호출한다', async () => {
    const options: DicoshotNotifyOptions = {
      title: '배포 완료',
      description: '성공',
      color: 'success',
    };
    reflector.get.mockReturnValue(options);
    const result$ = interceptor.intercept(createContext(), createCallHandler(of('ok')));

    await new Promise((resolve) => result$.subscribe({ complete: resolve }));

    expect(dicoshot.sendCustom).toHaveBeenCalledWith({
      title: '배포 완료',
      description: '성공',
      color: 'success',
    });
  });

  it('title/description이 함수면 args와 result를 받아 동적으로 계산한다', async () => {
    const options: DicoshotNotifyOptions = {
      title: (args) => `배포 완료: ${args[0]}`,
      description: (_args, result) => `결과: ${result}`,
    };
    reflector.get.mockReturnValue(options);
    const result$ = interceptor.intercept(createContext(['v1.0.0']), createCallHandler(of('ok')));

    await new Promise((resolve) => result$.subscribe({ complete: resolve }));

    expect(dicoshot.sendCustom).toHaveBeenCalledWith({
      title: '배포 완료: v1.0.0',
      description: '결과: ok',
      color: undefined,
    });
  });

  it('핸들러가 에러를 던지면 sendCustom을 호출하지 않는다', async () => {
    reflector.get.mockReturnValue({ title: '배포 완료' });
    const result$ = interceptor.intercept(
      createContext(),
      createCallHandler(throwError(() => new Error('fail'))),
    );

    await new Promise((resolve) => result$.subscribe({ error: resolve }));

    expect(dicoshot.sendCustom).not.toHaveBeenCalled();
  });

  it('sendCustom 실패(false 반환)는 스트림에 영향을 주지 않는다', async () => {
    reflector.get.mockReturnValue({ title: '배포 완료' });
    dicoshot.sendCustom.mockResolvedValueOnce(false);
    const result$ = interceptor.intercept(createContext(), createCallHandler(of('ok')));

    const value = await new Promise((resolve) => result$.subscribe({ next: resolve }));

    expect(value).toBe('ok');
  });
});
