/**
 * T36 — tiny in-process scheduler (no dependencies).
 *
 * - one timer per job, re-armed after each run (no setInterval drift, no overlapping runs per job)
 * - jittered delays, unref'd timers (never keep the process alive), never throws into the caller
 * - clock / timers / randomness injectable so tests use a fake clock and no network
 */

export interface SchedulerJob {
  id: string;
  description: string;
  /** Next planned run time (before jitter), computed from `now`. */
  next(now: Date): Date;
  /** Run once shortly after start (decided at start()). Default false. */
  runOnStart?: boolean | (() => boolean);
  /** Skip this run quietly (e.g. API key not configured). */
  enabled?: () => boolean;
  run(): Promise<void>;
}

export interface SchedulerJobStatus {
  id: string;
  description: string;
  enabled: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  nextRunAt: string | null;
}

export interface SchedulerTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SchedulerOptions {
  now?: () => Date;
  timers?: SchedulerTimers;
  random?: () => number;
  /** Max extra random delay added to each planned run. Default 60 s. */
  jitterMs?: number;
  /** Delay before startup runs (plus jitter). Default 10 s. */
  startupDelayMs?: number;
  log?: (message: string) => void;
}

const MAX_TIMEOUT_MS = 2_147_000_000;

const realTimers: SchedulerTimers = {
  setTimeout: (fn, ms) => {
    const h = setTimeout(fn, ms);
    h.unref?.();
    return h;
  },
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

/** Remove anything that looks like a credential and bound the length. */
export function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
  return raw
    .replace(/(api[_-]?key|apikey|token|key|secret|password|authorization)(["'\s]*[=:]["'\s]*)[^\s&"',;]+/gi, '$1$2[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

interface JobState {
  job: SchedulerJob;
  running: boolean;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  nextRunAt: Date | null;
  timer: unknown;
}

export class Scheduler {
  private readonly now: () => Date;
  private readonly timers: SchedulerTimers;
  private readonly random: () => number;
  private readonly jitterMs: number;
  private readonly startupDelayMs: number;
  private readonly log: (message: string) => void;
  private readonly states = new Map<string, JobState>();
  private started = false;

  constructor(jobs: SchedulerJob[], options: SchedulerOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.timers = options.timers ?? realTimers;
    this.random = options.random ?? Math.random;
    this.jitterMs = options.jitterMs ?? 60_000;
    this.startupDelayMs = options.startupDelayMs ?? 10_000;
    this.log = options.log ?? ((m) => console.warn(m));
    for (const job of jobs) {
      this.states.set(job.id, {
        job,
        running: false,
        lastRunAt: null,
        lastSuccessAt: null,
        lastError: null,
        nextRunAt: null,
        timer: null,
      });
    }
  }

  /** Arms all timers and returns immediately (never awaits a job). */
  start(): void {
    if (this.started) return;
    this.started = true;
    for (const st of this.states.values()) {
      let onStart = false;
      try {
        onStart = typeof st.job.runOnStart === 'function' ? st.job.runOnStart() : Boolean(st.job.runOnStart);
      } catch {
        onStart = false;
      }
      if (onStart) this.arm(st, this.startupDelayMs + this.random() * this.jitterMs);
      else this.armNext(st);
    }
  }

  stop(): void {
    this.started = false;
    for (const st of this.states.values()) {
      if (st.timer !== null) this.timers.clearTimeout(st.timer);
      st.timer = null;
      st.nextRunAt = null;
    }
  }

  status(): { enabled: boolean; jobs: SchedulerJobStatus[] } {
    const iso = (d: Date | null) => (d ? d.toISOString() : null);
    return {
      enabled: this.started,
      jobs: [...this.states.values()].map((st) => ({
        id: st.job.id,
        description: st.job.description,
        enabled: st.job.enabled ? st.job.enabled() : true,
        running: st.running,
        lastRunAt: iso(st.lastRunAt),
        lastSuccessAt: iso(st.lastSuccessAt),
        lastError: st.lastError,
        nextRunAt: iso(st.nextRunAt),
      })),
    };
  }

  /** Runs a job now unless it is already running. Resolves when finished; never rejects. */
  async runJob(id: string): Promise<void> {
    const st = this.states.get(id);
    if (!st || st.running) return;
    st.running = true;
    st.lastRunAt = this.now();
    try {
      if (st.job.enabled && !st.job.enabled()) {
        st.lastError = null;
        return;
      }
      await st.job.run();
      st.lastSuccessAt = this.now();
      st.lastError = null;
    } catch (err) {
      st.lastError = sanitizeError(err);
      this.log(`[scheduler] job ${id} failed: ${st.lastError}`);
    } finally {
      st.running = false;
    }
  }

  private armNext(st: JobState): void {
    let at: Date;
    try {
      at = st.job.next(this.now());
    } catch (err) {
      st.lastError = sanitizeError(err);
      this.log(`[scheduler] job ${st.job.id} has no next run: ${st.lastError}`);
      return;
    }
    this.arm(st, Math.max(0, at.getTime() - this.now().getTime()) + this.random() * this.jitterMs);
  }

  private arm(st: JobState, delayMs: number): void {
    if (!this.started) return;
    const ms = Math.min(Math.max(0, delayMs), MAX_TIMEOUT_MS);
    st.nextRunAt = new Date(this.now().getTime() + ms);
    st.timer = this.timers.setTimeout(() => {
      st.timer = null;
      st.nextRunAt = null;
      void this.runJob(st.job.id).finally(() => this.armNext(st));
    }, ms);
  }
}
