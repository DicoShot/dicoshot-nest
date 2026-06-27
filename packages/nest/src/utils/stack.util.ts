export class StackUtil {
  // node_modules를 건너뛰고 사용자 코드 프레임에서 file:line:col을 뽑아낸다.
  // 모든 프레임이 node_modules면 첫 번째 프레임을 폴백으로 사용한다.
  static extractLocation(stack: string | undefined): string | undefined {
    if (!stack) return undefined;

    const frames = stack
      .split('\n')
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('at '));

    const frame = frames.find((line) => !line.includes('node_modules')) ?? frames[0];
    if (!frame) return undefined;

    const parenMatch = frame.match(/\(([^)]+)\)\s*$/);
    return parenMatch ? parenMatch[1] : frame.replace(/^at\s+/, '');
  }
}
