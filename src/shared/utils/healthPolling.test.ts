import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEALTH_POLL_INTERVAL_MS,
  hasHealthSnapshotChanged,
  startActiveHealthPoller,
  type HealthSnapshotLike,
} from './healthPolling';

function makeSnapshot(overrides: Partial<HealthSnapshotLike['capabilities']> = {}): HealthSnapshotLike {
  return {
    status: 'OK',
    capabilities: {
      geminiServerKeyConfigured: false,
      firebaseConfigured: true,
      marketDataProvidersTotal: 8,
      marketDataProvidersConnected: 2,
      marketDataLiveProvidersConnected: 0,
      marketDataHistoricalProvidersConnected: 2,
      marketDataOverallStatus: 'HISTORICAL',
      ...overrides,
    },
  };
}

test('HEALTH_POLL_INTERVAL_MS defaults to 60 seconds', () => {
  assert.equal(HEALTH_POLL_INTERVAL_MS, 60_000);
});

test('hasHealthSnapshotChanged detects changes in overall status, providers, and capabilities', () => {
  const base = makeSnapshot();
  assert.equal(hasHealthSnapshotChanged(null, base), true);
  assert.equal(hasHealthSnapshotChanged(base, makeSnapshot()), false);
  assert.equal(
    hasHealthSnapshotChanged(base, makeSnapshot({ marketDataOverallStatus: 'DELAYED' })),
    true
  );
  assert.equal(
    hasHealthSnapshotChanged(base, makeSnapshot({ marketDataProvidersConnected: 3 })),
    true
  );
  assert.equal(
    hasHealthSnapshotChanged(base, makeSnapshot({ geminiServerKeyConfigured: true })),
    true
  );
});

test('startActiveHealthPoller polls every 60s when active, pauses when hidden, and catches up on resume', async () => {
  let clockMs = 1_000_000;
  let active = true;
  let tickCb: (() => void) | null = null;
  let visCb: (() => void) | null = null;
  let pollCalls = 0;
  let intervalMsPassed = 0;
  let cleared = false;
  let listenerRemoved = false;

  const stop = startActiveHealthPoller({
    now: () => clockMs,
    isActive: () => active,
    onPoll: () => {
      pollCalls += 1;
    },
    setIntervalFn: (cb, ms) => {
      tickCb = cb;
      intervalMsPassed = ms;
      return 42;
    },
    clearIntervalFn: (id) => {
      assert.equal(id, 42);
      cleared = true;
    },
    addVisibilityListener: (cb) => {
      visCb = cb;
    },
    removeVisibilityListener: (cb) => {
      assert.equal(cb, visCb);
      listenerRemoved = true;
    },
  });

  assert.equal(intervalMsPassed, 60_000);
  assert.equal(pollCalls, 0);

  // Tick at +60s while active -> polls.
  clockMs += 60_000;
  tickCb!();
  await Promise.resolve();
  assert.equal(pollCalls, 1);

  // Brief tab switch (< 60s) with no skipped tick -> should NOT spuriously poll.
  active = false;
  visCb!();
  clockMs += 5_000;
  active = true;
  visCb!();
  await Promise.resolve();
  assert.equal(pollCalls, 1);

  // Tick while hidden -> skipped, does not poll in background.
  active = false;
  clockMs += 60_000;
  tickCb!();
  await Promise.resolve();
  assert.equal(pollCalls, 1);

  // Returning active after skipped tick -> immediately catches up once.
  active = true;
  visCb!();
  await Promise.resolve();
  assert.equal(pollCalls, 2);

  // Stop cleans up timer and visibility listener; later ticks are ignored.
  stop();
  assert.equal(cleared, true);
  assert.equal(listenerRemoved, true);
  tickCb!();
  visCb!();
  await Promise.resolve();
  assert.equal(pollCalls, 2);
});

test('startActiveHealthPoller prevents overlapping in-flight polls', async () => {
  let tickCb: (() => void) | null = null;
  let release: (() => void) | null = null;
  let pollCalls = 0;

  const stop = startActiveHealthPoller({
    isActive: () => true,
    onPoll: () => {
      pollCalls += 1;
      return new Promise<void>((res) => {
        release = res;
      });
    },
    setIntervalFn: (cb) => {
      tickCb = cb;
      return 1;
    },
    clearIntervalFn: () => undefined,
    addVisibilityListener: () => undefined,
    removeVisibilityListener: () => undefined,
  });

  tickCb!();
  await Promise.resolve();
  assert.equal(pollCalls, 1);

  // Second tick while first is still in flight -> ignored.
  tickCb!();
  await Promise.resolve();
  assert.equal(pollCalls, 1);

  release!();
  await new Promise((r) => setTimeout(r, 0));
  tickCb!();
  await Promise.resolve();
  assert.equal(pollCalls, 2);
  stop();
});
