export class ThrottleUtil {
  private static readonly cache = new Map<string, number>();

  static shouldThrottle(key: string, seconds: number): boolean {
    const last = this.cache.get(key);
    const now = Date.now();
    if (last !== undefined && now - last < seconds * 1000) return true;
    this.cache.set(key, now);
    // Auto-evict after the throttle window expires so the Map never grows unboundedly
    setTimeout(() => this.cache.delete(key), seconds * 1000).unref();
    return false;
  }
}
