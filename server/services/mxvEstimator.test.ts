import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { INITIAL_INSTRUMENTS } from '../data/instruments.ts';
import { MERGED_INSTRUMENTS } from './instrumentRegistry.ts';
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { MarketQuote } from '../../src/shared/types/market.ts';
import { createUnavailableQuote } from '../../src/shared/utils/validation.ts';
import {
  computeMxvEstimate,
  MXV_ESTIMATE_LABEL,
  parseQuotationUnit,
  worstStatus,
  type FxRateInput,
} from './mxvEstimator.ts';
import { registerMxvEstimateRoutes } from '../routes/mxvEstimate.ts';

const NOW = new Date('2026-11-18T15:00:00.000Z');
const byId = (id: string) => INITIAL_INSTRUMENTS.find((i) => i.id === id)!;

function quote(inst: InstrumentDefinition, price: number | null, status: MarketQuote['status'], timestamp: string | null): MarketQuote {
  return {
    symbol: inst.exchangeSymbol,
    exchange: inst.exchange,
    contractMonth: null,
    price,
    bid: null,
    ask: null,
    volume: null,
    openInterest: null,
    currency: inst.specification.tradingCurrency,
    unit: inst.specification.quotationUnit,
    source: 'TEST',
    timestamp,
    retrievedAt: NOW.toISOString(),
    status,
  };
}

const FX_CURRENT: FxRateInput = { rate: 25650, status: 'CURRENT', timestamp: '2026-11-18T10:00:00.000Z', source: 'TEST_FX' };

test('every VERIFIED MXV mapping carries an MXV contract spec with an MXV source URL', () => {
  const mxv = INITIAL_INSTRUMENTS.filter((i) => i.mxvMapping?.mappingStatus === 'VERIFIED');
  assert.equal(mxv.length, 15);
  for (const inst of mxv) {
    const spec = inst.mxvMapping!.mxvContractSpec;
    assert.ok(spec, inst.id);
    assert.match(spec.sourceUrl, /^https:\/\/(en\.)?mxv\.com\.vn\//, inst.id);
    assert.ok(spec.contractSize > 0, inst.id);
  }
  // Verified on the MXV pages: same size as the linked contract (no mini) for ZCE, KCE, CPE.
  assert.equal(byId('CBOT:ZC').mxvMapping!.mxvContractSpec!.contractSize, 5000);
  assert.equal(byId('ICE:KC').mxvMapping!.mxvContractSpec!.contractSize, 37500);
  assert.equal(byId('COMEX:HG').mxvMapping!.mxvContractSpec!.contractSize, 25000);
  assert.equal(byId('SGX:FEF').mxvMapping!.mxvContractSpec!.contractSize, 100);
});

test('unit parsing and worst-status ordering', () => {
  assert.deepEqual(parseQuotationUnit('cents/bushel'), { usdFactor: 0.01, perUnit: 'bushel' });
  assert.deepEqual(parseQuotationUnit('USD/MT'), { usdFactor: 1, perUnit: 'metric ton' });
  assert.deepEqual(parseQuotationUnit('USD/troy oz'), { usdFactor: 1, perUnit: 'troy oz' });
  assert.equal(parseQuotationUnit('USD/barrel'), null);
  assert.equal(parseQuotationUnit('EUR/MT'), null);
  assert.equal(worstStatus(['CURRENT', 'DELAYED']), 'DELAYED');
  assert.equal(worstStatus(['HISTORICAL', 'USER_PROVIDED']), 'USER_PROVIDED');
  assert.equal(worstStatus(['STALE', 'CURRENT']), 'STALE');
});

test('ZCE: 450.25 cents/bu x 0.01 x 5000 bu = 22,512.5 USD; x 25,650 = 577,445,625 VND', () => {
  const zc = byId('CBOT:ZC');
  const r = computeMxvEstimate({ instrument: zc, quote: quote(zc, 450.25, 'DELAYED', '2026-11-18T14:00:00.000Z'), usdVnd: FX_CURRENT, now: NOW });
  assert.equal(r.refused, false);
  assert.equal(r.label, MXV_ESTIMATE_LABEL);
  assert.equal(r.mxvSymbol, 'ZCE');
  assert.ok(Math.abs(r.notionalUsd! - 22512.5) < 1e-6);
  assert.equal(r.notionalVnd, 577_445_625);
  assert.equal(r.status, 'DELAYED'); // worst of DELAYED price, CURRENT fx
  assert.equal(r.oldestInputTimestamp, '2026-11-18T10:00:00.000Z'); // fx is older than the price
  assert.equal(r.inputs.internationalPrice?.status, 'DELAYED');
  assert.equal(r.inputs.usdVnd?.source, 'TEST_FX');
  assert.equal(r.inputs.mxvContract.sourceUrl, 'https://mxv.com.vn/hang-hoa/nong-san/ngo.html');
});

test('CPE with a user-provided rate: 4.9875 USD/lb x 25,000 lb = 124,687.5 USD; x 26,000 = 3,241,875,000 VND', () => {
  const hg = byId('COMEX:HG');
  const fx: FxRateInput = { rate: 26000, status: 'USER_PROVIDED', timestamp: null, source: 'USER_PROVIDED' };
  const r = computeMxvEstimate({ instrument: hg, quote: quote(hg, 4.9875, 'HISTORICAL', '2026-11-17T00:00:00.000Z'), usdVnd: fx, now: NOW });
  assert.equal(r.refused, false);
  assert.ok(Math.abs(r.notionalUsd! - 124687.5) < 1e-6);
  assert.equal(r.notionalVnd, 3_241_875_000);
  assert.equal(r.status, 'USER_PROVIDED');
  assert.equal(r.oldestInputTimestamp, '2026-11-17T00:00:00.000Z');
  assert.ok(r.warnings.some((w) => w.includes('USER_PROVIDED')));
});

test('LRC (USD/MT) and ZRE (USD/cwt) conversions', () => {
  const rc = byId('ICE:RC');
  const r1 = computeMxvEstimate({ instrument: rc, quote: quote(rc, 4500, 'CURRENT', '2026-11-18T14:59:00.000Z'), usdVnd: FX_CURRENT, now: NOW });
  assert.equal(r1.notionalUsd, 45000); // 4500 USD/t x 10 t
  assert.equal(r1.notionalVnd, 1_154_250_000); // 45,000 x 25,650
  const zr = byId('CBOT:ZR');
  const r2 = computeMxvEstimate({ instrument: zr, quote: quote(zr, 15.5, 'CURRENT', '2026-11-18T14:59:00.000Z'), usdVnd: FX_CURRENT, now: NOW });
  assert.equal(r2.notionalUsd, 31000); // 15.5 USD/cwt x 2000 cwt
  assert.equal(r2.notionalVnd, 795_150_000); // 31,000 x 25,650
});

test('refuses when any input is UNAVAILABLE, the unit does not match, or the MXV spec is not verified', () => {
  const zc = byId('CBOT:ZC');
  const okQuote = quote(zc, 450.25, 'DELAYED', '2026-11-18T14:00:00.000Z');

  const noFx = computeMxvEstimate({
    instrument: zc,
    quote: okQuote,
    usdVnd: { rate: null, status: 'UNAVAILABLE', timestamp: null, source: 'NONE', reason: 'no key' },
    now: NOW,
  });
  assert.equal(noFx.refused, true);
  assert.equal(noFx.status, 'UNAVAILABLE');
  assert.equal(noFx.notionalVnd, null);
  assert.ok(noFx.refusalReasons.some((r) => r.includes('USD/VND')));

  const unavailable = createUnavailableQuote({
    symbol: 'ZC', exchange: 'CBOT', contractMonth: null, currency: 'USD', unit: 'cents/bushel', source: 'NONE', reason: 'DATA_UNAVAILABLE',
  });
  const noPrice = computeMxvEstimate({ instrument: zc, quote: unavailable, usdVnd: FX_CURRENT, now: NOW });
  assert.equal(noPrice.refused, true);
  assert.equal(noPrice.notionalVnd, null);

  const noTs = computeMxvEstimate({ instrument: zc, quote: { ...okQuote, timestamp: null }, usdVnd: FX_CURRENT, now: NOW });
  assert.equal(noTs.refused, true);

  const badUnit = computeMxvEstimate({ instrument: zc, quote: { ...okQuote, unit: 'USD/barrel' }, usdVnd: FX_CURRENT, now: NOW });
  assert.equal(badUnit.refused, true);
  assert.ok(badUnit.refusalReasons.some((r) => r.includes('Unsupported quotation unit')));

  const wrongUnit = computeMxvEstimate({ instrument: zc, quote: { ...okQuote, unit: 'USD/MT' }, usdVnd: FX_CURRENT, now: NOW });
  assert.equal(wrongUnit.refused, true);

  const unverified: InstrumentDefinition = { ...zc, mxvMapping: { ...zc.mxvMapping!, mappingStatus: 'UNVERIFIED' } };
  assert.equal(computeMxvEstimate({ instrument: unverified, quote: okQuote, usdVnd: FX_CURRENT, now: NOW }).refused, true);

  const { mxvContractSpec: _drop, ...mappingWithoutSpec } = zc.mxvMapping!;
  const noSpec: InstrumentDefinition = { ...zc, mxvMapping: mappingWithoutSpec };
  const r = computeMxvEstimate({ instrument: noSpec, quote: okQuote, usdVnd: FX_CURRENT, now: NOW });
  assert.equal(r.refused, true);
  assert.ok(r.refusalReasons.some((x) => x.includes('not been verified on an MXV source')));
});

// ---------------------------------------------------------------- routes

async function withServer(
  fx: { status: 'CURRENT' | 'UNAVAILABLE'; rate: number | null; timestamp: string | null; source: string; reason?: string },
  run: (base: string) => Promise<void>
): Promise<void> {
  const app = express();
  const instruments = { list: async () => MERGED_INSTRUMENTS };
  registerMxvEstimateRoutes(app, {
    instruments,
    now: () => NOW,
    providers: {
      getUsdVndRate: async () => fx,
      getQuoteForInstrument: async (inst) =>
        inst.id === 'CBOT:ZC'
          ? quote(inst, 450.25, 'DELAYED', '2026-11-18T14:00:00.000Z')
          : createUnavailableQuote({
              symbol: inst.exchangeSymbol,
              exchange: inst.exchange,
              contractMonth: null,
              currency: 'USD',
              unit: inst.specification.quotationUnit,
              source: 'NONE',
              reason: 'DATA_UNAVAILABLE',
            }),
    },
  });
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('GET /api/mxv/estimate/:mxvSymbol computes, refuses and validates', async () => {
  await withServer(FX_CURRENT as { status: 'CURRENT'; rate: number; timestamp: string; source: string }, async (base) => {
    const ok = await (await fetch(`${base}/api/mxv/estimate/zce`)).json();
    assert.equal(ok.notionalVnd, 577_445_625);
    assert.equal(ok.status, 'DELAYED');
    assert.equal(ok.label, 'Ước tính tham chiếu — không phải giá MXV');

    const manual = await (await fetch(`${base}/api/mxv/estimate/ZCE?usdVnd=26000&usdVndAsOf=2026-11-18`)).json();
    assert.equal(manual.inputs.usdVnd.status, 'USER_PROVIDED');
    assert.equal(manual.notionalVnd, 585_325_000); // 22,512.5 x 26,000
    assert.equal(manual.status, 'USER_PROVIDED');
    assert.equal(manual.oldestInputTimestamp, '2026-11-18T00:00:00.000Z');

    const fef = await (await fetch(`${base}/api/mxv/estimate/FEF`)).json();
    assert.equal(fef.refused, true); // SGX has no price source -> UNAVAILABLE -> refused
    assert.equal(fef.status, 'UNAVAILABLE');
    assert.equal(fef.notionalVnd, null);

    assert.equal((await fetch(`${base}/api/mxv/estimate/XXX`)).status, 404);
    const jru = await fetch(`${base}/api/mxv/estimate/JRU`); // owner-added, UNVERIFIED mapping
    assert.equal(jru.status, 422);
    assert.equal((await fetch(`${base}/api/mxv/estimate/ZCE?usdVnd=5`)).status, 400);
    assert.equal((await fetch(`${base}/api/mxv/estimate/Z$E`)).status, 400);
  });
});

test('GET /api/mxv/estimate lists every MXV-listed instrument; refuses all when FX is unavailable', async () => {
  await withServer({ status: 'UNAVAILABLE', rate: null, timestamp: null, source: 'NONE', reason: 'no key' }, async (base) => {
    const body = await (await fetch(`${base}/api/mxv/estimate`)).json();
    assert.equal(body.label, MXV_ESTIMATE_LABEL);
    assert.equal(body.count, 16); // 15 verified (incl. SGX FEF) + owner JRU
    const jru = body.items.find((i: { mxvSymbol: string }) => i.mxvSymbol === 'JRU');
    assert.equal(jru.eligible, false);
    const zce = body.items.find((i: { mxvSymbol: string }) => i.mxvSymbol === 'ZCE');
    assert.equal(zce.eligible, true);
    assert.equal(zce.estimate.refused, true);
    assert.equal(zce.estimate.notionalVnd, null);
  });
});
