import { Test, TestingModule } from '@nestjs/testing';

import { DICOSHOT_CLIENT } from './dicoshot.constants';
import { DicoshotService } from './dicoshot.service';

const mockClient = { send: jest.fn() };

async function createService(): Promise<DicoshotService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [DicoshotService, { provide: DICOSHOT_CLIENT, useValue: mockClient }],
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
    it('client.send()를 그대로 호출하고 성공 시 true를 반환한다', async () => {
      const message = { embeds: [{ title: '테스트' }] };
      const result = await service.send(message);
      expect(mockClient.send).toHaveBeenCalledWith(message);
      expect(result).toBe(true);
    });

    it('client.send() 실패 시 throw하지 않고 false를 반환한다', async () => {
      mockClient.send.mockRejectedValueOnce(new Error('network error'));
      const result = await service.send({ embeds: [] });
      expect(result).toBe(false);
    });
  });

  describe('sendCustom()', () => {
    it('title과 description으로 embed를 구성해 전송한다', async () => {
      await service.sendCustom({ title: '배포 완료', description: 'v1.0.0' });
      expect(mockClient.send).toHaveBeenCalledWith({
        embeds: [
          { title: '배포 완료', description: 'v1.0.0', color: undefined, fields: undefined },
        ],
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
        embeds: [{ title: '테스트', description: undefined, color: hex, fields: undefined }],
      });
    });

    it('color가 number이면 그대로 전달한다', async () => {
      await service.sendCustom({ title: '테스트', color: 0xff0000 });
      expect(mockClient.send).toHaveBeenCalledWith({
        embeds: [{ title: '테스트', description: undefined, color: 0xff0000, fields: undefined }],
      });
    });

    it('fields를 그대로 embed에 전달한다', async () => {
      const fields = [{ name: 'Version', value: 'v1.2.3', inline: true }];
      await service.sendCustom({ title: '테스트', fields });
      expect(mockClient.send).toHaveBeenCalledWith({
        embeds: [{ title: '테스트', description: undefined, color: undefined, fields }],
      });
    });

    it('mention을 content 필드에 넣어 실제 Discord 알림이 울리게 한다', async () => {
      await service.sendCustom({ title: '테스트', description: '본문', mention: '<@&123>' });
      expect(mockClient.send).toHaveBeenCalledWith({
        content: '<@&123>',
        embeds: [
          { title: '테스트', description: '본문', color: undefined, fields: undefined },
        ],
      });
    });

    it('description 없이 mention만 있으면 content에만 mention이 들어간다', async () => {
      await service.sendCustom({ title: '테스트', mention: '<@&123>' });
      expect(mockClient.send).toHaveBeenCalledWith({
        content: '<@&123>',
        embeds: [{ title: '테스트', description: undefined, color: undefined, fields: undefined }],
      });
    });

    it('client.send() 실패 시 throw하지 않고 false를 반환한다', async () => {
      mockClient.send.mockRejectedValueOnce(new Error('timeout'));
      const result = await service.sendCustom({ title: '테스트' });
      expect(result).toBe(false);
    });
  });
});
