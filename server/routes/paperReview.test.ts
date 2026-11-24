import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createWeeklyNarrator, registerPaperReviewRoutes, type PaperReviewRouteOptions, type WeeklySummary } from './paperReview.ts';

const SUMMARY: WeeklySummary = {
  trades: 4, wins: 2, losses: 2, winRatePct: 50, avgWinVnd: 3_000_000, avgLossVnd: -2_000_000, totalPnlVnd: 2_000_000,
  expectancyVnd: 500_000, expectancyR: 0.67, maxDrawdownPct: 4.3, stopLossPct: 75, biggestLossVnd: -3_000_000,
  noStop: 1, oversized: 0, offPlan: 1, eventTrades: 0, topMistakeTag: null,
};

async function withServer(opts: PaperReviewRouteOptions, fn: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerPaperReviewRoutes(app, opts);
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

const post = (base: string, body: unknown) =>
  fetch(`${base}/api/paper/weekly-review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('no key -> narrator null; route answers 503 so the client falls back', async () => {
  assert.equal(createWeeklyNarrator({}), null);
  await withServer({ narrator: null }, async (base) => {
    assert.equal((await post(base, { summary: SUMMARY })).status, 503);
  });
});

test('validates input strictly (numbers only, no extra fields)', async () => {
  await withServer({ narrator: async () => 'ok.' }, async (base) => {
    assert.equal((await post(base, { summary: { ...SUMMARY, name: 'Nguyen' } })).status, 400);
    assert.equal((await post(base, { summary: { ...SUMMARY, trades: 'x' } })).status, 400);
    assert.equal((await post(base, {})).status, 400);
  });
});

test('returns narrative and strips recommendation sentences; errors -> 502', async () => {
  let seen: WeeklySummary | null = null;
  await withServer(
    {
      narrator: async (s) => {
        seen = s;
        return 'Tuần này bạn giữ kỷ luật khá tốt. Bạn nên mua thêm ngô.';
      },
    },
    async (base) => {
      const r = await post(base, { summary: SUMMARY });
      assert.equal(r.status, 200);
      const j = (await r.json()) as { narrative: string };
      assert.ok(j.narrative.includes('kỷ luật'));
      assert.ok(!j.narrative.includes('mua thêm'));
      assert.deepEqual(seen, SUMMARY);
    }
  );
  await withServer({ narrator: async () => { throw new Error('boom'); } }, async (base) => {
    assert.equal((await post(base, { summary: SUMMARY })).status, 502);
  });
});

test('rate limited per client', async () => {
  await withServer({ narrator: async () => 'Ổn.', maxPerMinute: 2 }, async (base) => {
    assert.equal((await post(base, { summary: SUMMARY })).status, 200);
    assert.equal((await post(base, { summary: SUMMARY })).status, 200);
    assert.equal((await post(base, { summary: SUMMARY })).status, 429);
  });
});
