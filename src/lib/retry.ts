export interface RetryOptions {
  /** Extra attempts after the first one. */
  retries?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  /** Called before each wait, so the caller can tell the user what is happening. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retries `fn` with exponential backoff (base, 2x base, 4x base...). */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 500, shouldRetry = () => true, onRetry, sleep = defaultSleep } = options;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt > retries || !shouldRetry(error)) throw error;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}
