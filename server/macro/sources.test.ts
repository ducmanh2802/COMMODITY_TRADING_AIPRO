/**
 * T21 macro adapters — tests run only against recorded fixtures through an injected fetch.
 *
 * Fixtures in ./__fixtures__ were recorded from the live sources on 2026-11-18 (unmodified except
 * trimming): EIA API v2 (DEMO_KEY, series WCESTUS1/WGTSTUS1/WDISTUS1), ESMIS release API (first 4
 * results, descriptions truncated), WASDE Nov-2026 .txt (header + U.S. wheat/corn/soybean tables only),
 * Yahoo chart DX-Y.NYB, Vietcombank XML feed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ESMIS_WASDE_PUBLICATION_URL,
  ESMIS_WASDE_RELEASES_URL,
  VCB_XML_URL,
  YAHOO_DXY_URL,
  fetchDxy,
  fetchEiaWeeklyStocks,
  fetchUsdVndVcb,
  fetchWasde,
  parseEsmisUpcoming,
  parseVcbDateTime,
  parseWasdeText,
  type FetchLike,
} from './sources.ts';
import { MacroService } from './service.ts';

const fx = (name: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');
const EIA = fx('eia_wpsr_stocks_2026-11-06.json');
const ESMIS = fx('esmis_wasde_releases_2026-11-18.json');
const WASDE_TXT = fx('wasde1126_excerpt.txt');
const DXY = fx('yahoo_dxy_chart_2026-11-18.json');
const VCB = fx('vcb_exrate_2026-11-18.xml');
const WASDE_TXT_URL = 'https://esmis.nal.usda.gov/sites/default/release-files/796142/wasde1126.txt';

const NOW = new Date('2026-11-18T12:00:00Z');

function router(routes: Record<string, () => Response>, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);
    for (const [prefix, make] of Object.entries(routes)) if (url.startsWith(prefix)) return make();
    throw new Error(`unexpected network call in test: ${url}`);
  };
}
const ok = (body: string) => () => new Response(body, { status: 200 });

test('EIA: no key → UNAVAILABLE, no network call, no values', async () => {
  const calls: string[] = [];
  const r = await fetchEiaWeeklyStocks(router({}, calls), undefined, NOW);
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(calls.length, 0);
  assert.ok(r.items.every((i) => i.value === null && i.status === 'UNAVAILABLE'));
  assert.match(r.reason ?? '', /EIA_API_KEY/);
});

test('EIA: parses recorded weekly stocks with source, asOf and previous week', async () => {
  const calls: string[] = [];
  const r = await fetchEiaWeeklyStocks(router({ 'https://api.eia.gov/': ok(EIA) }, calls), 'SECRET123', NOW);
  assert.equal(r.status, 'HISTORICAL');
  const crude = r.items.find((i) => i.id === 'EIA_CRUDE_EX_SPR')!;
  assert.equal(crude.value, 414417);
  assert.equal(crude.previousValue, 409760);
  assert.equal(crude.asOf, '2026-11-06');
  assert.equal(crude.previousAsOf, '2026-10-30');
  assert.equal(crude.unit, 'thousand barrels');
  assert.equal(crude.sourceQuality, 'OFFICIAL');
  assert.equal(crude.releasedAt, null, 'release time is not invented');
  assert.equal(r.items.find((i) => i.id === 'EIA_GASOLINE')!.value, 210757);
  assert.equal(r.items.find((i) => i.id === 'EIA_DISTILLATE')!.value, 103330);
  // Key is sent to EIA but never exposed in the returned sourceUrl.
  assert.match(calls[0], /api_key=SECRET123/);
  assert.ok(r.items.every((i) => !i.sourceUrl.includes('SECRET123')));
});

test('EIA: old week → STALE; HTTP error → UNAVAILABLE; bad units → INVALID', async () => {
  const late = await fetchEiaWeeklyStocks(router({ 'https://api.eia.gov/': ok(EIA) }), 'k', new Date('2026-12-15T00:00:00Z'));
  assert.equal(late.status, 'STALE');

  const err = await fetchEiaWeeklyStocks(router({ 'https://api.eia.gov/': () => new Response('{}', { status: 403 }) }), 'k', NOW);
  assert.equal(err.status, 'UNAVAILABLE');
  assert.ok(err.items.every((i) => i.value === null));

  const bad = EIA.replace(/"MBBL"/g, '"MMBBL"');
  const inv = await fetchEiaWeeklyStocks(router({ 'https://api.eia.gov/': ok(bad) }), 'k', NOW);
  assert.equal(inv.status, 'INVALID');
  assert.ok(inv.items.every((i) => i.value === null && i.status === 'INVALID'));
});

test('EIA: network error message never leaks the key', async () => {
  const r = await fetchEiaWeeklyStocks(
    async () => {
      throw new Error('connect failed for ...api_key=TOPSECRET');
    },
    'TOPSECRET',
    NOW
  );
  assert.equal(r.status, 'UNAVAILABLE');
  assert.ok(!JSON.stringify(r).includes('TOPSECRET'));
});

test('WASDE: parses official text — U.S. ending stocks, Nov vs Oct projection', () => {
  const items = parseWasdeText(WASDE_TXT, { releasedAt: '2026-11-10', sourceUrl: WASDE_TXT_URL, fetchedAt: NOW.toISOString() });
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId.WASDE_US_CORN_ENDING_STOCKS.value, 1758);
  assert.equal(byId.WASDE_US_CORN_ENDING_STOCKS.previousValue, 1849);
  assert.equal(byId.WASDE_US_CORN_ENDING_STOCKS.unit, 'million bushels');
  assert.match(byId.WASDE_US_CORN_ENDING_STOCKS.asOf!, /2026\/27 projection \(Nov 2026/);
  assert.equal(byId.WASDE_US_SOYBEAN_ENDING_STOCKS.value, 300);
  assert.equal(byId.WASDE_US_SOYBEAN_ENDING_STOCKS.previousValue, 315);
  assert.equal(byId.WASDE_US_WHEAT_ENDING_STOCKS.value, 743);
  assert.equal(byId.WASDE_US_WHEAT_ENDING_STOCKS.previousValue, 740);
  assert.ok(items.every((i) => i.sourceQuality === 'OFFICIAL' && i.status === 'HISTORICAL' && i.releasedAt === '2026-11-10'));
});

test('WASDE: text for a different month than the release → INVALID (no values)', () => {
  const items = parseWasdeText(WASDE_TXT, { releasedAt: '2026-10-09', sourceUrl: WASDE_TXT_URL, fetchedAt: NOW.toISOString() });
  assert.ok(items.every((i) => i.status === 'INVALID' && i.value === null));
  const garbage = parseWasdeText('not a wasde file', { releasedAt: '2026-11-10', sourceUrl: WASDE_TXT_URL, fetchedAt: '' });
  assert.ok(garbage.every((i) => i.status === 'INVALID' && i.value === null));
});

test('WASDE: release calendar + key numbers via injected fetch', async () => {
  const r = await fetchWasde(
    router({
      [ESMIS_WASDE_RELEASES_URL]: ok(ESMIS),
      [ESMIS_WASDE_PUBLICATION_URL]: ok(JSON.stringify({ results: [{ upcoming_releases: [] }] })),
      [WASDE_TXT_URL]: ok(WASDE_TXT),
    }),
    NOW
  );
  assert.equal(r.status, 'HISTORICAL');
  assert.equal(r.releases[0].releasedAt, '2026-11-10');
  assert.equal(r.releases[0].releasedAtRaw, '2026-11-10T12:00:00+0000');
  assert.equal(r.releases[1].releasedAt, '2026-10-09');
  assert.deepEqual(r.upcoming, [], 'no estimated future dates');
  assert.equal(r.keyNumbers.length, 3);
  assert.ok(r.keyNumbers.every((k) => k.value !== null && k.sourceUrl === WASDE_TXT_URL));
});

test('WASDE: ESMIS down → UNAVAILABLE, nothing invented', async () => {
  const r = await fetchWasde(router({ [ESMIS_WASDE_RELEASES_URL]: () => new Response('', { status: 503 }) }), NOW);
  assert.equal(r.status, 'UNAVAILABLE');
  assert.deepEqual(r.releases, []);
  assert.ok(r.keyNumbers.every((k) => k.value === null));
});

test('WASDE: upcoming releases are taken only from what ESMIS lists (shape tolerant)', () => {
  // Synthetic shape test (ESMIS returned an empty list at recording time).
  const up = parseEsmisUpcoming({ results: [{ upcoming_releases: ['2026-12-09T12:00:00+0000', { release_datetime: 'bad' }] }] });
  assert.equal(up.length, 1);
  assert.equal(up[0].releasedAt, '2026-12-09');
});

test('DXY: disabled by default (UNOFFICIAL opt-in), no network call', async () => {
  const calls: string[] = [];
  const d = await fetchDxy(router({}, calls), false, NOW);
  assert.equal(d.status, 'UNAVAILABLE');
  assert.equal(d.value, null);
  assert.equal(d.sourceQuality, 'UNOFFICIAL');
  assert.equal(calls.length, 0);
});

test('DXY: parses recorded Yahoo chart, tagged UNOFFICIAL with timestamp', async () => {
  const at = new Date(1794998314 * 1000 + 30 * 60_000);
  const d = await fetchDxy(router({ [YAHOO_DXY_URL]: ok(DXY) }), true, at);
  assert.equal(d.value, 103.745);
  assert.equal(d.asOf, new Date(1794998314 * 1000).toISOString());
  assert.equal(d.status, 'DELAYED');
  assert.equal(d.sourceQuality, 'UNOFFICIAL');
  const wrong = await fetchDxy(router({ [YAHOO_DXY_URL]: ok(DXY.replace('"exchangeName":"NYB"', '"exchangeName":"XXX"')) }), true, at);
  assert.equal(wrong.status, 'INVALID');
  assert.equal(wrong.value, null);
});

test('USD/VND Vietcombank: parses recorded XML (UNOFFICIAL, Vietnam time → UTC)', async () => {
  assert.equal(parseVcbDateTime('11/18/2026 5:40:00 PM'), '2026-11-18T10:40:00.000Z');
  assert.equal(parseVcbDateTime('11/18/2026 12:05:00 AM'), '2026-11-17T17:05:00.000Z');
  assert.equal(parseVcbDateTime('garbage'), null);
  const v = await fetchUsdVndVcb(router({ [VCB_XML_URL]: ok(VCB) }), new Date('2026-11-18T11:00:00Z'));
  assert.equal(v.value, 25520);
  assert.deepEqual(v.details, { transfer: 25520, buyCash: 25490, sell: 25900 });
  assert.equal(v.asOf, '2026-11-18T10:40:00.000Z');
  assert.equal(v.sourceQuality, 'UNOFFICIAL');
  assert.equal(v.status, 'DELAYED');
  const down = await fetchUsdVndVcb(router({ [VCB_XML_URL]: () => new Response('', { status: 500 }) }), NOW);
  assert.equal(down.status, 'UNAVAILABLE');
  assert.equal(down.value, null);
});

test('MacroService: caches successes, SBV central rate always UNAVAILABLE (never guessed)', async () => {
  const calls: string[] = [];
  let now = new Date('2026-11-18T11:00:00Z');
  const svc = new MacroService({
    fetchFn: router({ [VCB_XML_URL]: ok(VCB), 'https://api.eia.gov/': ok(EIA) }, calls),
    env: { EIA_API_KEY: 'k' },
    now: () => now,
  });
  const a = await svc.getFx();
  const sbv = a.items.find((i) => i.id === 'USDVND_SBV_CENTRAL')!;
  assert.equal(sbv.status, 'UNAVAILABLE');
  assert.equal(sbv.value, null);
  assert.equal(sbv.sourceQuality, 'OFFICIAL');
  await svc.getFx();
  await Promise.all([svc.getEia(), svc.getEia()]);
  assert.equal(calls.filter((c) => c === VCB_XML_URL).length, 1, 'fx cached');
  assert.equal(calls.filter((c) => c.startsWith('https://api.eia.gov/')).length, 1, 'eia cached + deduped');
  now = new Date(now.getTime() + 11 * 60_000);
  await svc.getFx();
  assert.equal(calls.filter((c) => c === VCB_XML_URL).length, 2, 'fx TTL expired');
});
