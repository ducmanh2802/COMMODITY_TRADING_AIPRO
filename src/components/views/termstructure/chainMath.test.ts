import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveChain, liquidityMovedAway } from './chainMath.ts';
import { computeVolumeProfile } from './volumeProfile.ts';

test('deriveChain: spread, shares, leader', () => {
  const d = deriveChain([
    { contract: 'H', price: 100, volume: 100, openInterest: null },
    { contract: 'K', price: 103, volume: 300, openInterest: null },
    { contract: 'N', price: 99, volume: null, openInterest: null },
  ]);
  assert.equal(d.rows[0].spreadVsNear, null);
  assert.equal(d.rows[1].spreadVsNear, 3);
  assert.equal(d.rows[2].spreadVsNear, -1);
  assert.equal(d.rows[1].volumeShare, 0.75);
  assert.equal(d.rows[2].volumeShare, null);
  assert.equal(d.volumeLeader, 1);
  assert.equal(d.oiLeader, null);
  assert.equal(d.rows[0].oiShare, null);
  assert.equal(liquidityMovedAway(d), true);
});

test('deriveChain: nearest leader is not "moved away"; no volume => no leader', () => {
  const near = deriveChain([
    { contract: 'H', price: 1, volume: 5, openInterest: null },
    { contract: 'K', price: 2, volume: 1, openInterest: null },
  ]);
  assert.equal(liquidityMovedAway(near), false);
  const none = deriveChain([{ contract: 'H', price: 1, volume: null, openInterest: null }]);
  assert.equal(none.volumeLeader, null);
  assert.equal(liquidityMovedAway(none), false);
});

test('volume profile: POC, conservation, value area, skipped bars', () => {
  const bars = [
    { timestamp: 'a', low: 10, high: 12, volume: 100 },
    { timestamp: 'b', low: 11, high: 13, volume: 300 },
    { timestamp: 'c', low: 19, high: 20, volume: 50 },
    { timestamp: 'd', low: 10, high: 20, volume: null },
  ];
  const p = computeVolumeProfile(bars, { buckets: 10 })!;
  assert.equal(p.usedBars, 3);
  assert.equal(p.skippedBars, 1);
  assert.ok(Math.abs(p.totalVolume - 450) < 1e-9);
  assert.ok(p.poc >= 11 && p.poc <= 13);
  assert.ok(p.vaLowIndex <= p.pocIndex && p.pocIndex <= p.vaHighIndex);
  const inVa = p.buckets.slice(p.vaLowIndex, p.vaHighIndex + 1).reduce((a, b) => a + b.volume, 0);
  assert.ok(inVa >= 0.7 * p.totalVolume);
});

test('volume profile: no volume or flat range returns null', () => {
  assert.equal(computeVolumeProfile([{ timestamp: 'a', low: 1, high: 2, volume: null }]), null);
  assert.equal(computeVolumeProfile([{ timestamp: 'a', low: 5, high: 5, volume: 10 }]), null);
});
