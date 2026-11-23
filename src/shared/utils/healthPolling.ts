import type { DataQualityStatus } from '../types/market';

/** Polling cadence for `/api/health` when the application tab is active. */
export const HEALTH_POLL_INTERVAL_MS = 60_000;

export interface HealthSnapshotLike {
  status: string;
  capabilities: {
    geminiServerKeyConfigured: boolean;
    firebaseConfigured: boolean;
    marketDataProvidersTotal: number;
    marketDataProvidersConnected: number;
    marketDataLiveProvidersConnected?: number;
    marketDataHistoricalProvidersConnected?: number;
    marketDataOverallStatus: DataQualityStatus;
  };
}

/**
 * Detects whether a newly polled `/api/health` payload changed any capability or
 * overall data-health state compared with the previous snapshot.
 */
export function hasHealthSnapshotChanged(
  prev: HealthSnapshotLike | null,
  next: HealthSnapshotLike
): boolean {
  if (!prev) return true;
  if (prev.status !== next.status) return true;
  const a = prev.capabilities;
  const b = next.capabilities;
  return (
    a.marketDataOverallStatus !== b.marketDataOverallStatus ||
    a.marketDataProvidersConnected !== b.marketDataProvidersConnected ||
    a.marketDataProvidersTotal !== b.marketDataProvidersTotal ||
    a.marketDataLiveProvidersConnected !== b.marketDataLiveProvidersConnected ||
    a.marketDataHistoricalProvidersConnected !== b.marketDataHistoricalProvidersConnected ||
    a.geminiServerKeyConfigured !== b.geminiServerKeyConfigured ||
    a.firebaseConfigured !== b.firebaseConfigured
  );
}

export interface ActiveHealthPollerOptions {
  intervalMs?: number;
  onPoll: () => Promise<void> | void;
  isActive?: () => boolean;
  now?: () => number;
  setIntervalFn?: (cb: () => void, ms: number) => unknown;
  clearIntervalFn?: (id: unknown) => void;
  addVisibilityListener?: (cb: () => void) => void;
  removeVisibilityListener?: (cb: () => void) => void;
}

/**
 * Starts a periodic poller that runs `onPoll()` every `intervalMs` (default 60s)
 * only while the app is active (`!document.hidden`), deduplicates concurrent runs,
 * and catches up immediately on returning to active if a tick was skipped or stale.
 */
export function startActiveHealthPoller(options: ActiveHealthPollerOptions): () => void {
  const intervalMs = options.intervalMs ?? HEALTH_POLL_INTERVAL_MS;
  const now = options.now ?? (() => Date.now());
  const isActive =
    options.isActive ??
    (() => (typeof document === 'undefined' ? true : !document.hidden));
  const setIntervalFn =
    options.setIntervalFn ??
    ((cb, ms) => window.setInterval(cb, ms));
  const clearIntervalFn =
    options.clearIntervalFn ??
    ((id) => window.clearInterval(id as number));
  const addVisibilityListener =
    options.addVisibilityListener ??
    ((cb) => {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', cb);
      }
    });
  const removeVisibilityListener =
    options.removeVisibilityListener ??
    ((cb) => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', cb);
      }
    });

  let stopped = false;
  let inFlight = false;
  let lastAttemptAt = now();
  let skippedWhileInactive = false;

  const runPoll = () => {
    if (stopped || inFlight) return;
    inFlight = true;
    lastAttemptAt = now();
    skippedWhileInactive = false;
    Promise.resolve()
      .then(() => options.onPoll())
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
      });
  };

  const onTick = () => {
    if (stopped) return;
    if (!isActive()) {
      skippedWhileInactive = true;
      return;
    }
    runPoll();
  };

  const onVisibilityChange = () => {
    if (stopped || !isActive()) return;
    if (skippedWhileInactive || now() - lastAttemptAt >= intervalMs) {
      runPoll();
    }
  };

  const timerId = setIntervalFn(onTick, intervalMs);
  addVisibilityListener(onVisibilityChange);

  return () => {
    stopped = true;
    clearIntervalFn(timerId);
    removeVisibilityListener(onVisibilityChange);
  };
}
