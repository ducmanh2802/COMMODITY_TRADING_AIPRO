import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRollCheck, ROLL_MISMATCH_FLAG } from './rollCheck.ts';
import { parseYahooContractMonth } from '../providers/yahooAdapter.ts';
import type { MarketQuote } from '../../src/shared/types/market.ts';

const quote = (over: Partial<MarketQuote> = {}): MarketQuote => ({
  symbol: 'ZC', exchange: 'CBOT', contractMonth: '2027-03', contractLabel: 'Mar-2027', price: 448.75, bid: null, ask: null,
  volume: null, openInterest: null, currency: 'USD', unit: 'cents/bushel', source: 'yahoo:ZC=F',
  timestamp: '2026-11-20T19:19:00.000Z', retrievedAt: '2026-11-21T00:00:00.000Z', status: 'DELAYED', statusReason: 'base', ...over,
});

test('parseYahooContractMonth reads the month from shortName', () => {
  assert.deepEqual(parseYahooContractMonth('Corn Futures,Mar-2027'), { month: '2027-03', label: 'Mar-2027' });
  assert.deepEqual(parseYahooContractMonth('Corn Futures,Dec-2026'), { month: '2026-12', label: 'Dec-2026' });
  assert.equal(parseYahooContractMonth('Corn Futures'), null);
  assert.equal(parseYahooContractMonth(undefined), null);
});

test('ROLL_MISMATCH flagged when quote and last daily close differ >1.5% (ZC 448.75 vs 434.5)', () => {
  const q = applyRollCheck(quote(), { close: 434.5, timestamp: '2026-11-20T00:00:00.000Z' });
  assert.equal(q.consistencyFlag, ROLL_MISMATCH_FLAG);
  assert.match(q.statusReason ?? '', /^ROLL_MISMATCH/);
  assert.match(q.statusReason ?? '', /Mar-2027/);
  assert.equal(q.price, 448.75); // never altered
});

test('no flag for small differences, same known month, or missing data', () => {
  assert.equal(applyRollCheck(quote({ price: 436 }), { close: 434.5, timestamp: '2026-11-20T00:00:00.000Z' }).consistencyFlag, undefined);
  assert.equal(applyRollCheck(quote(), { close: 434.5, timestamp: '2026-11-20T00:00:00.000Z', contractMonth: '2027-03' }).consistencyFlag, undefined);
  assert.equal(applyRollCheck(quote(), null).consistencyFlag, undefined);
  assert.equal(applyRollCheck(quote({ price: null }), { close: 434.5, timestamp: 'x' }).consistencyFlag, undefined);
});
