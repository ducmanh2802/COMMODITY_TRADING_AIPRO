import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler, sanitizeError, type SchedulerTimers } from './scheduler.ts';
import { buildSchedulerJobs, nextCotCheck, nextFxRefresh } from './jobs.ts';

function fakeClock(startIso: string) {
  let t = Date.parse(startIso);
  const timers: Array<{ at: number; fn: () => void; id: number; cleared: boolean }> = [];
  let seq = 0;
  const api: SchedulerTimers = {
    setTimeout(fn, ms) {
      const h = { at: t + ms, fn, id: ++seq, cleared: false };
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
    pending: () => timers.filter((x) => !x.cleared && x.at >= 0 && !('fired' in x)),
    async advance(ms: number) {
      t += ms;
      for (const h of timers.filter((x) => !x.cleared && x.at <= t)) {
        h.cleared = true;
        h.fn();
      }
      await new Promise((r) => setImmediate(r));
    },
  };
}

test('nextCotCheck is the following Friday 21:00 UTC', () => {
  assert.equal(nextCotCheck(new Date('2026-11-18T12:00:00Z')).toISOString(), '2026-11-20T21:00:00.000Z');
  assert.equal(nextCotCheck(new Date('2026-11-20T21:00:00Z')).toISOString(), '2026-11-27T21:00:00.000Z');
});

test('nextFxRefresh: 30 min in VN hours, else next business 08:00 ICT', () => {
  // Wed 12:00 UTC = 19:00 ICT -> Thu 08:00 ICT = Thu 01:00 UTC
  assert.equal(nextFxRefresh(new Date('2026-11-18T12:00:00Z')).toISOString(), '2026-11-19T01:00:00.000Z');
  // Wed 03:00 UTC = 10:00 ICT
  assert.equal(nextFxRefresh(new Date('2026-11-18T03:00:00Z')).toISOString(), '2026-11-18T03:30:00.000Z');
  // Fri 12:00 UTC -> Mon 01:00 UTC
  assert.equal(nextFxRefresh(new Date('2026-11-20T12:00:00Z')).toISOString(), '2026-11-23T01:00:00.000Z');
});

test('sanitizeError strips keys and tokens', () => {
  const s = sanitizeError(new Error('GET https://x/y?api_key=SECRET123&a=1 failed; Bearer abc.def'));
  assert.ok(!s.includes('SECRET123'));
  assert.ok(!s.includes('abc.def'));
});

test('scheduler runs jobs, records status, never overlaps, re-arms', async () => {
  const clock = fakeClock('2026-11-18T03:00:00Z');
  let calls = 0;
  let release: () => void = () => {};
  const logs: string[] = [];
  const s = new Scheduler(
    [
      {
        id: 'a',
        description: 'a',
        next: (n) => new Date(n.getTime() + 1000),
        run: () => {
          calls++;
          return new Promise<void>((r) => (release = r));
        },
      },
      {
        id: 'bad',
        description: 'bad',
        next: (n) => new Date(n.getTime() + 1000),
        run: async () => {
          throw new Error('boom token=abc123');
        },
      },
    ],
    { now: clock.now, timers: clock.timers, random: () => 0, log: (m) => logs.push(m) },
  );
  s.start();
  await clock.advance(1000);
  assert.equal(calls, 1);
  assert.equal(s.status().jobs[0].running, true);
  // overlapping manual trigger is ignored
  await s.runJob('a');
  assert.equal(calls, 1);
  release();
  await clock.advance(0);
  const st = s.status().jobs;
  assert.ok(st[0].lastSuccessAt);
  assert.ok(st[0].nextRunAt);
  assert.match(st[1].lastError ?? '', /boom/);
  assert.ok(!(st[1].lastError ?? '').includes('abc123'));
  assert.ok(st[1].nextRunAt);
  await clock.advance(1000);
  assert.equal(calls, 2);
  s.stop();
  assert.equal(s.status().enabled, false);
});

test('COT catch-up on startup only when last success is older than 8 days; macro skipped without keys', async () => {
  const mk = (last: string | null) => ({
    listMappings: () => [
      { instrumentId: 'CBOT:ZC', status: 'REPORTED', cftcContractMarketCode: '002602' },
      { instrumentId: 'X:NO', status: 'NOT_REPORTED', cftcContractMarketCode: null },
    ],
    synced: [] as string[],
    async sync(id: string) {
      this.synced.push(id);
      return { status: 'SUCCESS' as const };
    },
    health: () => ({ markets: [{ reports: [{ lastSuccessfulSyncAt: last }] }] }),
  });
  const now = () => new Date('2026-11-18T03:00:00Z');
  for (const [last, expected] of [
    [null, true],
    ['2026-11-01T00:00:00Z', true],
    ['2026-11-14T00:00:00Z', false],
  ] as const) {
    const cot = mk(last);
    const jobs = buildSchedulerJobs({ cot, now, env: {} });
    const job = jobs.find((j) => j.id === 'cot-weekly')!;
    assert.equal((job.runOnStart as () => boolean)(), expected);
    await job.run();
    assert.deepEqual(cot.synced, ['CBOT:ZC']);
  }
  const macroCalls: string[] = [];
  const jobs = buildSchedulerJobs({
    macro: {
      getEia: async () => macroCalls.push('eia'),
      getWasde: async () => macroCalls.push('wasde'),
      getFx: async () => macroCalls.push('fx'),
    },
    fredSync: async () => ({ synced: 0, error: 'FRED_API_KEY not configured.' }),
    env: {},
    now,
  });
  const clock = fakeClock('2026-11-18T03:00:00Z');
  const s = new Scheduler(jobs, { now: clock.now, timers: clock.timers, random: () => 0 });
  s.start();
  await clock.advance(10_000);
  assert.deepEqual(macroCalls, ['wasde']);
  const eia = s.status().jobs.find((j) => j.id === 'macro-eia')!;
  assert.equal(eia.enabled, false);
  s.stop();
});
