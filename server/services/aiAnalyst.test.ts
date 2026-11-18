import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle, MarketQuote } from '../../src/shared/types/market.ts';
import { INITIAL_INSTRUMENTS } from '../data/instruments.ts';
import { analyzeTechnicalSnapshot } from '../engines/technicalEngine.ts';
import {
  AI_SYSTEM_INSTRUCTION,
  buildAnalystPrompt,
  buildDataInputs,
  findRecommendationTerms,
  generateResearchSummary,
  stripRecommendationLanguage,
  type AiAnalystContext,
  type AiCotData,
  type AiModelClient,
  type AiModelRequest,
} from './aiAnalyst.ts';

const NOW = new Date('2026-11-18T03:00:00Z');
const GC = INITIAL_INSTRUMENTS.find((i) => i.id === 'COMEX:GC')!;

function candles(count: number): MarketCandle[] {
  const startMs = Date.parse('2026-09-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const close = 2400 + i * 1.5 + Math.sin(i / 3) * 4;
    const open = close - 1;
    return {
      symbol: 'GC',
      exchange: 'COMEX',
      timeframe: 'H4',
      timestamp: new Date(startMs + i * 4 * 3600_000).toISOString(),
      retrievedAt: '2026-11-17T00:00:00Z',
      open,
      high: close + 1.2,
      low: open - 1.1,
      close,
      volume: 1500,
      openInterest: 40000,
      isComplete: true,
      source: 'CSV_HISTORICAL',
      status: 'HISTORICAL',
    };
  });
}

const DELAYED_QUOTE: MarketQuote = {
  symbol: 'GC',
  exchange: 'COMEX',
  contractMonth: null,
  price: 2612.4,
  bid: null,
  ask: null,
  volume: 1000,
  openInterest: null,
  currency: 'USD',
  unit: 'troy oz',
  source: 'YAHOO_UNOFFICIAL',
  timestamp: '2026-11-18T02:45:00Z',
  retrievedAt: '2026-11-18T02:59:00Z',
  status: 'DELAYED',
  delayMinutes: 15,
  sourceQuality: 'UNOFFICIAL',
};

function ctx(overrides: Partial<AiAnalystContext> = {}): AiAnalystContext {
  return {
    instrument: GC,
    timeframe: 'H4',
    language: 'en',
    quote: DELAYED_QUOTE,
    snapshot: analyzeTechnicalSnapshot(candles(120), 'GC', 'COMEX', 'H4'),
    candleSource: 'SQLITE CSV_IMPORT',
    cot: null,
    ...overrides,
  };
}

function fakeClient(output: unknown, seen: AiModelRequest[] = []): AiModelClient {
  return {
    model: 'fake-model',
    async generate(req) {
      seen.push(req);
      return typeof output === 'string' ? output : JSON.stringify(output);
    },
  };
}

test('prompt carries quality label, source and as-of for every block; UNAVAILABLE stated, not guessed', () => {
  const c = ctx();
  const inputs = buildDataInputs(c, NOW);
  const prompt = buildAnalystPrompt(c, inputs, NOW);
  assert.match(prompt, /### \[QUOTE\][^\n]*\nquality: DELAYED \| sourceQuality: UNOFFICIAL \| source: YAHOO_UNOFFICIAL \| as-of: 2026-11-18T02:45:00Z/);
  assert.match(prompt, /### \[TECHNICAL\][^\n]*\nquality: HISTORICAL \| source: technicalEngine over SQLITE CSV_IMPORT \| as-of: 20/);
  assert.match(prompt, /### \[SPEC\][^\n]*\nquality: (VERIFIED|UNVERIFIED) \|/);
  assert.match(prompt, /### \[COT\][^\n]*\nquality: UNAVAILABLE/);
  assert.match(prompt, /data: UNAVAILABLE — no data for this block\. Report it as a data gap; do not estimate it\./);
  assert.match(prompt, /"price":2612\.4/);
});

test('system prompt forbids buy/sell/entry/target/stop and requires sourced structured output', () => {
  for (const word of ['buy', 'sell', 'entry', 'target', 'stop loss', 'take profit']) {
    assert.ok(AI_SYSTEM_INSTRUCTION.toLowerCase().includes(word), word);
  }
  assert.match(AI_SYSTEM_INSTRUCTION, /NOT trading advice/);
  assert.match(AI_SYSTEM_INSTRUCTION, /sourceRefs/);
  assert.match(AI_SYSTEM_INSTRUCTION, /dataGaps/);
});

test('COT block is labelled with report date and STALE when older than 17 days', () => {
  const cot: AiCotData = {
    status: 'OK',
    reportType: 'DISAGGREGATED',
    source: 'CFTC COT (socrata)',
    note: null,
    analytics: {
      status: 'OK',
      latest: {
        reportDate: '2026-10-20',
        expectedReleaseDate: '2026-10-23',
        openInterest: 500000,
        categories: { managedMoney: { long: 200000, short: 50000, spread: 1000, net: 150000, netPctOi: 30, netChangeWoW: 5000, cotIndex: 82.3 } },
      },
    },
  } as unknown as AiCotData;
  const inputs = buildDataInputs(ctx({ cot }), NOW);
  const block = inputs.find((i) => i.id === 'COT')!;
  assert.equal(block.quality, 'STALE');
  assert.equal(block.asOf, '2026-10-20');
  assert.equal(block.sourceQuality, 'OFFICIAL');
});

test('no API key → UNAVAILABLE NO_API_KEY, model never called, no fabricated text', async () => {
  const seen: AiModelRequest[] = [];
  const r = await generateResearchSummary(ctx(), { apiKey: '', modelClient: fakeClient({}, seen), now: () => NOW });
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(r.unavailableReason, 'NO_API_KEY');
  assert.equal(seen.length, 0);
  assert.equal(r.summary, '');
  assert.deepEqual(r.keyFacts, []);
  assert.ok(r.inputs.length === 4);
});

test('no verified market data → UNAVAILABLE NO_VERIFIED_DATA without a model call', async () => {
  const seen: AiModelRequest[] = [];
  const r = await generateResearchSummary(
    ctx({ quote: null, snapshot: analyzeTechnicalSnapshot([], 'GC', 'COMEX', 'H4') }),
    { apiKey: 'k', modelClient: fakeClient({}, seen), now: () => NOW }
  );
  assert.equal(r.unavailableReason, 'NO_VERIFIED_DATA');
  assert.equal(seen.length, 0);
  assert.ok(r.dataGaps.includes('QUOTE: UNAVAILABLE'));
});

test('post-check strips recommendation sentences and drops unsourced facts', async () => {
  const seen: AiModelRequest[] = [];
  const r = await generateResearchSummary(ctx(), {
    apiKey: 'k',
    now: () => NOW,
    modelClient: fakeClient(
      {
        summary:
          'Gold last traded at 2612.4 on a DELAYED, UNOFFICIAL quote. You should buy near 2600 with a target of 2700. RSI is elevated.',
        keyFacts: [
          { statement: 'Delayed quote 2612.4 USD/troy oz.', sourceRefs: ['QUOTE'] },
          { statement: 'Place a stop loss at 2580.', sourceRefs: ['TECHNICAL'] },
          { statement: 'Managed money is net long.', sourceRefs: ['COT'] },
          { statement: 'Nên mua vào khi giá về 2600.', sourceRefs: ['QUOTE'] },
        ],
        risks: ['Quote is delayed 15 minutes and unofficial.', 'Entry here is risky.'],
        dataGaps: ['COT data not loaded.'],
      },
      seen
    ),
  });
  assert.equal(seen.length, 1);
  assert.equal(r.status, 'OK');
  assert.equal(r.model, 'fake-model');
  assert.equal(r.summary, 'Gold last traded at 2612.4 on a DELAYED, UNOFFICIAL quote. RSI is elevated.');
  assert.deepEqual(r.keyFacts, [{ statement: 'Delayed quote 2612.4 USD/troy oz.', sourceRefs: ['QUOTE'] }]);
  assert.deepEqual(r.risks, ['Quote is delayed 15 minutes and unofficial.']);
  assert.ok(r.dataGaps.includes('COT: UNAVAILABLE'));
  assert.equal(r.postCheck.flagged, true);
  assert.equal(r.postCheck.removedSentences, 4);
  assert.equal(r.postCheck.droppedUnsourcedFacts, 1); // COT fact cites an UNAVAILABLE block
  for (const t of ['buy', 'target', 'stop loss', 'entry']) assert.ok(r.postCheck.matchedTerms.includes(t), t);
  const all = [r.summary, ...r.keyFacts.map((f) => f.statement), ...r.risks, ...r.dataGaps].join(' ');
  assert.deepEqual(findRecommendationTerms(all), []);
});

test('recommendation detector keeps descriptive COT / market wording (EN + VI)', () => {
  for (const ok of [
    'Managed money net long rose by 5,000 contracts week over week.',
    'Short-term trend is bullish; long-term trend is sideways.',
    'The sell-off paused near the 20-period EMA.',
    'Quỹ đầu cơ duy trì vị thế mua ròng 150.000 hợp đồng.',
    'Xu hướng ngắn hạn tăng.',
  ]) {
    assert.deepEqual(findRecommendationTerms(ok), [], ok);
  }
  for (const bad of ['Consider a long entry at 2600.', 'Stop-loss below 2580.', 'Nên bán khi giá chạm kháng cự.', 'Chốt lời tại 2700.', 'BUY gold now.']) {
    assert.ok(findRecommendationTerms(bad).length > 0, bad);
  }
  assert.deepEqual(stripRecommendationLanguage('A. Sell now. B.'), { text: 'A. B.', removed: 1, terms: ['sell'] });
});

test('model timeout → UNAVAILABLE MODEL_TIMEOUT; errors and bad JSON do not leak internals', async () => {
  const logged: unknown[] = [];
  const hang: AiModelClient = {
    model: 'fake',
    generate: (req) =>
      new Promise((_, reject) => req.signal.addEventListener('abort', () => reject(new Error('aborted')))),
  };
  const r1 = await generateResearchSummary(ctx(), { apiKey: 'k', modelClient: hang, timeoutMs: 20, now: () => NOW, logError: (_m, e) => logged.push(e) });
  assert.equal(r1.unavailableReason, 'MODEL_TIMEOUT');

  const failing: AiModelClient = {
    model: 'fake',
    generate: async () => {
      throw Object.assign(new Error('secret upstream detail key=abc'), { status: 429 });
    },
  };
  const r2 = await generateResearchSummary(ctx(), { apiKey: 'k', modelClient: failing, now: () => NOW, logError: (_m, e) => logged.push(e) });
  assert.equal(r2.unavailableReason, 'MODEL_RATE_LIMITED');
  assert.ok(!JSON.stringify(r2).includes('secret upstream'));

  const r3 = await generateResearchSummary(ctx(), { apiKey: 'k', modelClient: fakeClient('not json'), now: () => NOW, logError: (_m, e) => logged.push(e) });
  assert.equal(r3.unavailableReason, 'INVALID_MODEL_OUTPUT');
  assert.equal(r3.summary, '');
  assert.equal(logged.length, 3);
});
