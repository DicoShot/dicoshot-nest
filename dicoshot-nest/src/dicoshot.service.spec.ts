import { Test, TestingModule } from '@nestjs/testing';
import { DicoshotService } from './dicoshot.service';
import { DICOSHOT_CLIENT } from './dicoshot.constants';

const mockClient = { send: jest.fn() };

async function createService(): Promise<DicoshotService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DicoshotService,
      { provide: DICOSHOT_CLIENT, useValue: mockClient },
    ],
  }).compile();
  return module.get(DicoshotService);
}

describe('DicoshotService', () => {
  let service: DicoshotService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await createService();
  });

  describe('send()', () => {
    it('client.send()를 그대로 호출한다', async () => {
      const message = { embeds: [{ title: '테스트' }] };
      await service.send(message);
      expect(mockClient.send).toHaveBeenCalledWith(message);
    });

    it('client.send() 실패 시 에러를 throw한다', async () => {
      mockClient.send.mockRejectedValueOnce(new Error('network error'));
      await expect(service.send({ embeds: [] })).rejects.toThrow('network error');
    });
  });

  describe('sendCustom()', () => {
    it('title과 description으로 embed를 구성해 전송한다', async () => {
      await service.sendCustom({ title: '배포 완료', description: 'v1.0.0' });
      expect(mockClient.send).toHaveBeenCalledWith({
        embeds: [{ title: '배포 완료', description: 'v1.0.0', color: undefined }],
      });
    });

    it.each([
      ['success', 0x57f287],
      ['danger', 0xed4245],
      ['warning', 0xfee75c],
      ['info', 0x5865f2],
    ] as const)("color '%s' → hex %i 로 변환한다", async (preset, hex) => {
      await service.sendCustom({ title: '테스트', color: preset });
      expect(mockClient.send).toHaveBeenCalledWith({
        embeds: [{ title: '테스트', description: undefined, color: hex }],
      });
    });

    it('color가 number이면 그대로 전달한다', async () => {
      await service.sendCustom({ title: '테스트', color: 0xff0000 });
      expect(mockClient.send).toHaveBeenCalledWith({
        embeds: [{ title: '테스트', description: undefined, color: 0xff0000 }],
      });
    });

    it('client.send() 실패 시 에러를 throw한다', async () => {
      mockClient.send.mockRejectedValueOnce(new Error('timeout'));
      await expect(service.sendCustom({ title: '테스트' })).rejects.toThrow('timeout');
    });
  });
});
