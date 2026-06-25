export class StackUtil {
  // 스택의 첫 번째 "at ..." 프레임에서 실제 에러가 발생한 file:line:col만 뽑아낸다
  static extractLocation(stack: string | undefined): string | undefined {
    if (!stack) return undefined;

    const frame = stack
      .split('\n')
      .slice(1)
      .map((line) => line.trim())
      .find((line) => line.startsWith('at '));
    if (!frame) return undefined;

    const parenMatch = frame.match(/\(([^)]+)\)\s*$/);
    return parenMatch ? parenMatch[1] : frame.replace(/^at\s+/, '');
  }
}
