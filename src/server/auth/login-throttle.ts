const MAX_FAILURES = 5;
const WINDOW_MS = 5 * 60 * 1000;

/** Limits password guessing: 5 failed attempts per e-mail every 5 minutes. */
export class LoginThrottle {
  private failures = new Map<string, { count: number; since: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  isBlocked(key: string): boolean {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (this.now() - entry.since > WINDOW_MS) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= MAX_FAILURES;
  }

  recordFailure(key: string): void {
    const entry = this.failures.get(key);
    if (!entry || this.now() - entry.since > WINDOW_MS) {
      this.failures.set(key, { count: 1, since: this.now() });
    } else {
      entry.count += 1;
    }
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}
