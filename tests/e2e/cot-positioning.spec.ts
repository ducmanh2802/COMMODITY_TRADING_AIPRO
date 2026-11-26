import { test, expect, type Page } from '@playwright/test';

/**
 * QA for CotPositioningCard (CotView, /cot).
 *
 * Data state: SYNTHETIC COT weekly rows (deterministic, NOT CFTC data) served by page.route mocks of
 * /api/cot/markets and /api/cot/:id, because no import path exists for COT reports.
 */
const ONBOARDING_KEY = 'ctap.onboardingDone';
const BAD_TEXT = /\bNaN\b|\bInfinity\b|\bundefined\b|\[object Object\]/;
const TAP = 39.5;
const CATS = ['producerMerchant', 'swapDealers', 'managedMoney', 'otherReportables', 'nonReportables'] as const;

function syntheticRows(weeks: number) {
  const end = Date.parse('2026-06-02T00:00:00Z'); // a Tuesday
  const rows = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(end - i * 7 * 86_400_000).toISOString().slice(0, 10);
    const k = weeks - 1 - i;
    const categories: Record<string, unknown> = {};
    CATS.forEach((c, ci) => {
      const net = Math.round(5000 * Math.sin((k + ci * 7) / 9) * (ci + 1) + k * 40);
      categories[c] = { long: 50000 + net, short: 50000, spread: null, net, netPctOi: (net / 400000) * 100, netChangeWoW: 100, cotIndex: 55 };
    });
    rows.push({ reportDate: d, expectedReleaseDate: d, openInterest: 400000, openInterestChange4w: 0, categories });
  }
  return rows;
}

function cotResponse(weeks: number) {
  const rows = syntheticRows(weeks);
  return {
    retrievedAt: '2026-06-05T00:00:00Z',
    count: rows.length,
    instrumentId: 'CBOT:ZS',
    cftcContractMarketCode: 'SYNTH',
    reportType: 'DISAGGREGATED',
    timingNotice: 'SYNTHETIC e2e fixture (not CFTC data)',
    provenance: { sources: ['SYNTHETIC e2e fixture'], fetchedAt: null },
    rows: [],
    analytics: {
      status: 'OK', warnings: [], reportType: 'DISAGGREGATED', lookbackWeeks: 156, maxMissingWeeks: 0,
      formula: {}, gaps: [], rows, latest: rows[rows.length - 1],
    },
  };
}

async function mockCot(page: Page, weeks: number) {
  await page.route('**/api/cot/markets', (route) =>
    route.fulfill({
      json: { markets: [{ instrumentId: 'CBOT:ZS', status: 'REPORTED', cftcContractMarketCode: 'SYNTH', reportTypes: ['DISAGGREGATED'], evidence: null, notes: 'SYNTHETIC e2e fixture' }] },
    }),
  );
  await page.route('**/api/cot/CBOT%3AZS?**', (route) => route.fulfill({ json: cotResponse(weeks) }));
  await page.route('**/api/cot/CBOT:ZS?**', (route) => route.fulfill({ json: cotResponse(weeks) }));
}

async function open(page: Page, weeks: number) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await mockCot(page, weeks);
  await page.addInitScript((k) => {
    try { window.localStorage.setItem(k, '1'); } catch { /* ignore */ }
  }, ONBOARDING_KEY);
  await page.goto('/cot');
  await expect(page.getByTestId('cotpx-card')).toBeVisible({ timeout: 20_000 });
  return problems;
}

test.describe('CotPositioningCard', () => {
  test('renders finite values with a full window, no "ít dữ liệu" chip', async ({ page }) => {
    const problems = await open(page, 160);
    const text = await page.getByTestId('cotpx-card').innerText();
    expect(text).not.toMatch(BAD_TEXT);
    for (const id of ['cotpx-net', 'cotpx-pct', 'cotpx-index']) {
      const v = (await page.getByTestId(id).innerText()).replace(/[^\d.,+\-−]/g, '');
      expect(v.length, id).toBeGreaterThan(0);
    }
    const pct = Number((await page.getByTestId('cotpx-pct').innerText()).replace(',', '.'));
    expect(Number.isFinite(pct) && pct >= 0 && pct <= 100).toBeTruthy();
    const idx = Number((await page.getByTestId('cotpx-index').innerText()).replace(',', '.'));
    expect(Number.isFinite(idx) && idx >= 0 && idx <= 100).toBeTruthy();
    await expect(page.getByTestId('cotpx-few')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('category buttons switch and keep values finite', async ({ page }) => {
    await open(page, 160);
    const group = page.getByRole('group', { name: /nhóm|category/i });
    const buttons = group.getByRole('button');
    expect(await buttons.count()).toBeGreaterThanOrEqual(3);
    const before = await page.getByTestId('cotpx-net').innerText();
    const n = await buttons.count();
    let changed = false;
    for (let i = 0; i < n; i++) {
      await buttons.nth(i).click();
      await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'true');
      await expect(group.locator('button[aria-pressed="true"]')).toHaveCount(1);
      const txt = await page.getByTestId('cotpx-card').innerText();
      expect(txt).not.toMatch(BAD_TEXT);
      if ((await page.getByTestId('cotpx-net').innerText()) !== before) changed = true;
    }
    expect(changed, 'net should differ between categories').toBeTruthy();
  });

  test('short history shows "ít dữ liệu" chip', async ({ page }) => {
    await open(page, 20);
    await expect(page.getByTestId('cotpx-few')).toHaveText(/ít dữ liệu/i);
    expect(await page.getByTestId('cotpx-card').innerText()).not.toMatch(BAD_TEXT);
  });

  test('explanation <details> opens', async ({ page }) => {
    await open(page, 160);
    const details = page.locator('details', { hasText: 'Xem giải thích' });
    await expect(details).not.toHaveAttribute('open', /.*/);
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', /.*/);
    await expect(details.locator('li').first()).toBeVisible();
  });

  test('tap targets >= 40px and no horizontal scroll at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, 160);
    const sizes = await page
      .getByRole('group', { name: /nhóm|category/i })
      .locator('button')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(sizes.length).toBeGreaterThan(0);
    for (const h of sizes) expect(h).toBeGreaterThanOrEqual(TAP);
    const summaryH = await page.locator('details summary', { hasText: 'Xem giải thích' }).evaluate((e) => e.getBoundingClientRect().height);
    expect(summaryH).toBeGreaterThanOrEqual(TAP);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, 'horizontal overflow px').toBeLessThanOrEqual(1);
  });
});
