import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler, type SchedulerTimers } from '../scheduler/scheduler.ts';

function fakeClock(startMs: number) {
  let t = startMs;
  const timers: Array<{ at: number; fn: () => void; cleared: boolean }> = [];
  const api: SchedulerTimers = {
    setTimeout(fn, ms) {
      const h = { at: t + ms, fn, cleared: false };
      timers.push(h);
      return h;
    },
    clearTimeout(h) {
      (h as { cleared: boolean }).cleared = true;
    },
  };
  return {
    now: () => new Date(t),
    timers: api,
    nextAt: () => Math.min(...timers.filter((x) => !x.cleared).map((x) => x.at)),
    async advanceTo(target: number) {
      for (;;) {
        const due = timers.filter((x) => !x.cleared && x.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        t = Math.max(t, due.at);
        due.cleared = true;
        due.fn();
        for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
      }
      t = target;
    },
  };
}

test('scheduler chaos: job that throws every time backs off, never rejects, status keeps lastError', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  try {
    const clock = fakeClock(Date.parse('2026-11-24T00:00:00Z'));
    let runs = 0;
    const logs: string[] = [];
    const s = new Scheduler(
      [
        {
          id: 'boom',
          description: 'always fails',
          // planned time is "now": without a backoff floor this would spin.
          next: (n) => n,
          run: async () => {
            runs++;
            throw new Error(`upstream 500 api_key=SECRET${runs}`);
          },
        },
        {
          id: 'sync-throw',
          description: 'throws synchronously',
          next: (n) => new Date(n.getTime() + 1000),
          run: (() => {
            throw new Error('sync boom');
          }) as () => Promise<void>,
        },
      ],
      { now: clock.now, timers: clock.timers, random: () => 0, jitterMs: 0, backoffBaseMs: 1000, maxBackoffMs: 8000, log: (m) => logs.push(m) }
    );
    s.start();
    const start = clock.now().getTime();
    await clock.advanceTo(start + 60_000);
    // delays 1,2,4,8,8,... s => far fewer than 60 immediate retries
    assert.ok(runs >= 5 && runs <= 12, `bounded retries, got ${runs}`);
    const boom = s.status().jobs.find((j) => j.id === 'boom')!;
    assert.match(boom.lastError ?? '', /upstream 500/);
    assert.ok(!(boom.lastError ?? '').includes('SECRET'), 'secret redacted');
    assert.equal(boom.lastSuccessAt, null);
    assert.ok(boom.nextRunAt, 'still scheduled');
    assert.equal(boom.running, false);
    const sync = s.status().jobs.find((j) => j.id === 'sync-throw')!;
    assert.match(sync.lastError ?? '', /sync boom/);
    assert.ok(sync.nextRunAt);
    assert.ok(logs.length > 0);
    s.stop();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('scheduler chaos: success after failures resets backoff and clears lastError', async () => {
  const clock = fakeClock(Date.parse('2026-11-24T00:00:00Z'));
  let fail = true;
  const s = new Scheduler(
    [{ id: 'flaky', description: 'flaky', next: (n) => new Date(n.getTime() + 1000), run: async () => { if (fail) throw new Error('x'); } }],
    { now: clock.now, timers: clock.timers, random: () => 0, jitterMs: 0, backoffBaseMs: 5000, log: () => {} }
  );
  s.start();
  const t0 = clock.now().getTime();
  await clock.advanceTo(t0 + 20_000);
  assert.ok(s.status().jobs[0].lastError);
  fail = false;
  await clock.advanceTo(t0 + 120_000);
  const st = s.status().jobs[0];
  assert.equal(st.lastError, null);
  assert.ok(st.lastSuccessAt);
});

test('scheduler chaos: hung job is abandoned after jobTimeoutMs, schedule continues', async () => {
  const clock = fakeClock(Date.parse('2026-11-24T00:00:00Z'));
  let runs = 0;
  const s = new Scheduler(
    [{ id: 'hang', description: 'never resolves', next: (n) => new Date(n.getTime() + 1000), run: () => { runs++; return new Promise<void>(() => {}); } }],
    { now: clock.now, timers: clock.timers, random: () => 0, jitterMs: 0, jobTimeoutMs: 5000, backoffBaseMs: 1000, log: () => {} }
  );
  s.start();
  const t0 = clock.now().getTime();
  await clock.advanceTo(t0 + 60_000);
  assert.ok(runs >= 2, `re-run after timeout, got ${runs}`);
  assert.match(s.status().jobs[0].lastError ?? '', /timed out/);
});

test('scheduler chaos: throwing enabled()/next()/logger never escape status() or timers', async () => {
  const clock = fakeClock(Date.parse('2026-11-24T00:00:00Z'));
  const s = new Scheduler(
    [
      { id: 'e', description: 'enabled throws', enabled: () => { throw new Error('cfg'); }, next: (n) => new Date(n.getTime() + 1000), run: async () => {} },
      { id: 'n', description: 'next throws', next: () => { throw new Error('bad schedule'); }, run: async () => {} },
      { id: 'l', description: 'logger throws', next: (n) => new Date(n.getTime() + 1000), run: async () => { throw new Error('x'); } },
    ],
    { now: clock.now, timers: clock.timers, random: () => 0, jitterMs: 0, log: () => { throw new Error('log broken'); } }
  );
  s.start();
  await clock.advanceTo(clock.now().getTime() + 5000);
  const jobs = s.status().jobs;
  assert.equal(jobs.find((j) => j.id === 'e')!.enabled, false);
  assert.match(jobs.find((j) => j.id === 'n')!.lastError ?? '', /bad schedule/);
  assert.ok(jobs.find((j) => j.id === 'l')!.lastError);
});
