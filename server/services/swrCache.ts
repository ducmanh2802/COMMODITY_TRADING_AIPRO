/**
 * Tiny stale-while-revalidate cache for expensive, idempotent computations (scorecard list, market pulse,
 * cycle overview). Rules:
 *  - a value younger than `ttlMs` is served as-is (`stale: false`);
 *  - an older value is still served immediately (`stale: true`) while ONE background refresh runs;
 *  - only the very first call (no value yet) waits for the computation;
 *  - a failed refresh keeps the previous value (error is recorded, never thrown to readers that have a value).
 */
export interface SwrSnapshot<T> {
  value: T;
  /** ISO time the value was computed. */
  asOf: string;
  /** true when older than ttl (a refresh is, or is about to be, running). */
  stale: boolean;
  refreshing: boolean;
}

export interface SwrCacheOptions<T> {
  compute: () => Promise<T>;
  ttlMs: number;
  now?: () => number;
  /** Hard cap for one computation; the refresh is abandoned (previous value kept) after this. */
  timeoutMs?: number;
}

export class SwrCache<T> {
  private entry: { value: T; at: number } | null = null;
  private inflight: Promise<void> | null = null;
  private dirty = false;
  lastError: string | null = null;
  private readonly now: () => number;

  constructor(private readonly opts: SwrCacheOptions<T>) {
    this.now = opts.now ?? Date.now;
  }

  /** Starts a refresh unless one is running. Resolves when it settles (never rejects). */
  refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.dirty = false;
    const run = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const work = this.opts.compute();
        const guarded = this.opts.timeoutMs
          ? Promise.race([
              work,
              new Promise<never>((_, rej) => {
                timer = setTimeout(() => rej(new Error('refresh timed out')), this.opts.timeoutMs);
                timer.unref?.();
              }),
            ])
          : work;
        const value = await guarded;
        this.entry = { value, at: this.now() };
        this.lastError = null;
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : 'refresh failed';
      } finally {
        if (timer) clearTimeout(timer);
        this.inflight = null;
      }
    };
    this.inflight = run();
    return this.inflight;
  }

  /** Marks the cached value stale so the next read triggers a background refresh (value is still served). */
  invalidate(): void {
    this.dirty = true;
  }

  peek(): SwrSnapshot<T> | null {
    if (!this.entry) return null;
    const stale = this.dirty || this.now() - this.entry.at >= this.opts.ttlMs;
    return { value: this.entry.value, asOf: new Date(this.entry.at).toISOString(), stale, refreshing: this.inflight !== null };
  }

  async get(): Promise<SwrSnapshot<T>> {
    const snap = this.peek();
    if (snap) {
      if (snap.stale && !this.inflight) void this.refresh();
      return { ...snap, refreshing: this.inflight !== null };
    }
    await this.refresh();
    const first = this.peek();
    if (!first) throw new Error(this.lastError ?? 'computation failed');
    return first;
  }
}
