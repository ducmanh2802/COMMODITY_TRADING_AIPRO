import { test, expect, type Page, type Locator, type APIRequestContext } from '@playwright/test';

/**
 * QA for the four analysis tools: CarryCard (/duong-ky-han), CrushCard (Analysis > Spreads),
 * SeasonalWindowCard (Analysis > Seasonality) and the TSMOM_12M / DONCHIAN_BREAKOUT backtest strategies.
 *
 * Data state: SYNTHETIC test series (clearly labelled, deterministic, NOT market data) are imported into the
 * throw-away e2e database through the real import API. Empty state: /api/data/datasets is mocked to be empty.
 */
const ONBOARDING_KEY = 'ctap.onboardingDone';
const BAD_TEXT = /\bNaN\b|\bInfinity\b|\bundefined\b|\[object Object\]/;
const TAP = 39.5; // tolerate sub-pixel rounding of a 40px target

function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function csv(dates: string[], base: number, amp: number, seed: number): string {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5;
  const rows = ['Date,Open,High,Low,Close,Volume'];
  dates.forEach((d, i) => {
    const year = (i / 252) * 2 * Math.PI;
    const c = base + amp * Math.sin(year) + (i / dates.length) * amp + amp * 0.15 * rnd();
    const o = c - amp * 0.02 * rnd();
    rows.push(`${d},${o.toFixed(2)},${(Math.max(o, c) + amp * 0.03).toFixed(2)},${(Math.min(o, c) - amp * 0.03).toFixed(2)},${c.toFixed(2)},1000`);
  });
  return rows.join('\n');
}

async function importSeries(request: APIRequestContext, instrumentId: string, contractCode: string, text: string) {
  const res = await request.post('/api/data/import', {
    data: {
      instrumentId,
      contractCode,
      timeframe: 'D1',
      csv: text,
      dateFormat: 'YYYY-MM-DD',
      timezone: 'America/Chicago',
      sourceLabel: 'SYNTHETIC e2e fixture (not market data)',
      sourceQuality: 'USER_PROVIDED',
      priceUnit: 'test-unit',
      continuousAdjustment: contractCode === 'CONTINUOUS' ? 'UNADJUSTED' : 'NONE',
      mode: 'replace',
      sort: true,
    },
  });
  expect(res.ok(), `import ${instrumentId} ${contractCode}: ${res.status()} ${(await res.text()).slice(0, 300)}`).toBeTruthy();
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  const long = weekdays('2018-01-01', '2025-12-31');
  await importSeries(request, 'CBOT:ZS', 'CONTINUOUS', csv(long, 1000, 120, 11));
  await importSeries(request, 'CBOT:ZM', 'CONTINUOUS', csv(long, 330, 40, 22));
  await importSeries(request, 'CBOT:ZL', 'CONTINUOUS', csv(long, 50, 6, 33));
  const recent = weekdays('2026-06-01', '2026-06-15');
  await importSeries(request, 'CBOT:ZS', 'ZSN26', csv(recent, 1000, 5, 44));
  await importSeries(request, 'CBOT:ZS', 'ZSQ26', csv(recent, 1012, 5, 55));
  await importSeries(request, 'CBOT:ZS', 'ZSU26', csv(recent, 1030, 5, 66));
});

function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text().slice(0, 300)}`);
  });
  return problems;
}

async function open(page: Page, path: string) {
  await page.addInitScript((k) => {
    try { window.localStorage.setItem(k, '1'); } catch { /* ignore */ }
  }, ONBOARDING_KEY);
  await page.goto(path);
  await expect(page.locator('main').first()).toBeVisible();
}

async function expectClean(card: Locator) {
  const text = (await card.innerText()).trim();
  expect(text.length).toBeGreaterThan(20);
  expect(text, `bad token in: ${text.slice(0, 300)}`).not.toMatch(BAD_TEXT);
}

async function expectTapTargets(card: Locator) {
  const sizes = await card.locator('button:visible, input:visible:not([type=checkbox]), select:visible, summary:visible').evaluateAll((els) =>
    els.map((e) => ({ tag: e.tagName, text: (e.textContent ?? '').trim().slice(0, 30), h: e.getBoundingClientRect().height })),
  );
  for (const s of sizes) expect(s.h, `${s.tag} "${s.text}" height`).toBeGreaterThanOrEqual(TAP);
}

async function expectNoHScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, 'horizontal overflow px').toBeLessThanOrEqual(1);
}

async function emptyDatasets(page: Page) {
  await page.route('**/api/data/datasets**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0, datasets: [] }) }),
  );
}

async function openAnalysisTab(page: Page, tab: RegExp) {
  await open(page, '/phan-tich-nang-cao');
  await page.getByRole('tab', { name: tab }).click();
}

async function openExplainer(card: Locator) {
  const det = card.locator('details').last();
  await det.locator('summary').click();
  await expect(det).toHaveJSProperty('open', true);
}

for (const vp of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
]) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('CarryCard: data state', async ({ page }) => {
      const problems = watch(page);
      await open(page, '/duong-ky-han');
      const card = page.locator('section[aria-label]').filter({ has: page.locator('dl') }).filter({ hasText: /roll|carry/i }).last();
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card.locator('dl')).toBeVisible();
      await expectClean(card);
      await expect(card.locator('span.rounded-full').first()).toBeVisible();
      const n = card.locator('input[type=number]');
      await n.fill('6');
      await expectClean(card);
      await n.fill('0');
      await expectClean(card);
      await n.fill('');
      await expectClean(card);
      await n.fill('3');
      await openExplainer(card);
      await expectClean(card);
      await expectTapTargets(card);
      await expectNoHScroll(page);
      expect(problems).toEqual([]);
    });

    test('CarryCard: no datasets -> no crash', async ({ page }) => {
      const problems = watch(page);
      await emptyDatasets(page);
      await open(page, '/duong-ky-han');
      await page.waitForLoadState('networkidle').catch(() => {});
      expect(await page.locator('main').innerText()).not.toMatch(BAD_TEXT);
      await expectNoHScroll(page);
      expect(problems).toEqual([]);
    });

    test('CrushCard: data state', async ({ page }) => {
      const problems = watch(page);
      await openAnalysisTab(page, /chênh|spread/i);
      const card = page.getByTestId('crush-card');
      await expect(page.getByTestId('crush-value')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('crush-z')).toBeVisible();
      await expect(card.locator('svg').first()).toBeVisible();
      await expect(card.locator('ul li').first()).toBeVisible();
      await expectClean(card);
      await openExplainer(card);
      await expectTapTargets(card);
      await expectNoHScroll(page);
      expect(problems).toEqual([]);
    });

    test('CrushCard: missing legs -> chưa có dữ liệu', async ({ page }) => {
      const problems = watch(page);
      await emptyDatasets(page);
      await openAnalysisTab(page, /chênh|spread/i);
      const card = page.getByTestId('crush-card');
      await expect(card).toBeVisible();
      await expect(card).toContainText(/chưa có dữ liệu|thiếu|ZM|ZL|ZS/i);
      await expect(page.getByTestId('crush-value')).toHaveCount(0);
      await expectClean(card);
      await expectNoHScroll(page);
      expect(problems).toEqual([]);
    });

    test('SeasonalWindowCard: per-year table + scan', async ({ page }) => {
      const problems = watch(page);
      await openAnalysisTab(page, /mùa vụ|seasonal/i);
      await page.locator('#seas-series').selectOption('CBOT:ZS|CONTINUOUS|D1');
      await expect(page.getByTestId('swin-sample')).toBeVisible({ timeout: 30_000 });
      const card = page.locator('section[aria-label]').filter({ has: page.getByTestId('swin-sample') });
      expect(await card.locator('tbody tr').count()).toBeGreaterThanOrEqual(5);
      await expectClean(card);
      await card.locator('button[aria-pressed]').click();
      const scan = page.getByTestId('swin-scan');
      await expect(scan).toBeVisible();
      await expectClean(scan);
      await openExplainer(card);
      await expectTapTargets(card);
      await expectNoHScroll(page);
      expect(problems).toEqual([]);
    });

    test('SeasonalWindowCard: odd window (31 Feb) does not crash', async ({ page }) => {
      const problems = watch(page);
      await openAnalysisTab(page, /mùa vụ|seasonal/i);
      await page.locator('#seas-series').selectOption('CBOT:ZS|CONTINUOUS|D1');
      await expect(page.getByTestId('swin-sample')).toBeVisible({ timeout: 30_000 });
      await page.locator('#swin-sm').selectOption('2');
      await page.locator('#swin-sd').selectOption('31');
      await page.locator('#swin-em').selectOption('2');
      await page.locator('#swin-ed').selectOption('30');
      expect(await page.locator('main').innerText()).not.toMatch(BAD_TEXT);
      expect(problems).toEqual([]);
    });
  });
}

test.describe('Backtest TSMOM_12M / DONCHIAN_BREAKOUT', () => {
  for (const id of ['TSMOM_12M', 'DONCHIAN_BREAKOUT']) {
    test(`${id}: label, explainer, run`, async ({ page }) => {
      const problems = watch(page);
      await open(page, '/backtest');
      const select = page.locator('#bt-strategy');
      const opt = select.locator(`option[value="${id}"]`);
      await expect(opt).toHaveCount(1, { timeout: 30_000 });
      const label = (await opt.innerText()).trim();
      expect(label).not.toMatch(/^[A-Z_0-9]+$/);
      await select.selectOption(id);

      const det = page.getByTestId('bt-trend-explainer');
      await det.locator('summary').click();
      await expect(det).toHaveJSProperty('open', true);
      expect(await det.innerText()).not.toMatch(/trf2\./);

      await page.locator('#bt-symbol').selectOption('ZS');
      await page.locator('form button[type=submit]').click();
      // either a result or a friendly warning/error, never a crash
      const ok = page.getByTestId('bt-sim-label');
      const friendly = page.getByText(/chưa có dữ liệu|không khả dụng|không thể kiểm thử|không đủ|lỗi|thất bại/i).first();
      await expect(ok.or(friendly)).toBeVisible({ timeout: 60_000 });
      await expect(ok, "synthetic ZS D1 data must yield a result").toBeVisible();
      expect(await page.locator("form button[type=submit]").evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(TAP);
      expect(await page.locator('main').first().innerText()).not.toMatch(BAD_TEXT);
      expect(problems).toEqual([]);
    });
  }
});
