/**
 * Pure (DOM-free) request cache: TTL + in-flight de-duplication + stale-while-revalidate.
 * Failures are never cached. Used by fetchJsonWithRetry for GET JSON reads.
 */
export interface RequestCacheGetOptions {
  /** Fresh window in ms. 0 disables caching (in-flight de-dup still applies). Default 60 000. */
  ttlMs?: number;
  /** Max age (ms) a stale entry may still be served while revalidating. Default 10 x ttl. */
  maxStaleMs?: number;
}

interface Entry {
  value: unknown;
  at: number;
}

export const DEFAULT_TTL_MS = 60_000;

export class RequestCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly now: () => number = Date.now) {}

  get size(): number {
    return this.entries.size;
  }

  private load<T>(key: string, loader: () => Promise<T>, ttlMs: number): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p: Promise<T> = loader().then(
      (value) => {
        // Only store when not invalidated meanwhile (entry in map is still this promise).
        if (this.inflight.get(key) === p) {
          this.inflight.delete(key);
          if (ttlMs > 0) this.entries.set(key, { value, at: this.now() });
        }
        return value;
      },
      (err: unknown) => {
        if (this.inflight.get(key) === p) this.inflight.delete(key);
        throw err;
      }
    );
    this.inflight.set(key, p);
    return p;
  }

  get<T>(key: string, loader: () => Promise<T>, opts: RequestCacheGetOptions = {}): Promise<T> {
    const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    if (ttlMs <= 0) return this.load(key, loader, 0);
    const maxStale = opts.maxStaleMs ?? ttlMs * 10;
    const hit = this.entries.get(key);
    if (hit) {
      const age = this.now() - hit.at;
      if (age < ttlMs) return Promise.resolve(hit.value as T);
      if (age < maxStale) {
        // stale-while-revalidate: serve cached now, refresh in background.
        this.load(key, loader, ttlMs).catch(() => undefined);
        return Promise.resolve(hit.value as T);
      }
      this.entries.delete(key);
    }
    return this.load(key, loader, ttlMs);
  }

  /** Drop cached + in-flight entries whose key starts with prefix (omit prefix to clear all). */
  invalidate(prefix = ''): void {
    for (const k of [...this.entries.keys()]) if (k.startsWith(prefix)) this.entries.delete(k);
    for (const k of [...this.inflight.keys()]) if (k.startsWith(prefix)) this.inflight.delete(k);
  }
}
