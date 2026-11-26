import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';

// axe-core is not a declared dependency: install it (`npm i -D axe-core`) to enable; otherwise the suite skips.
const require_ = createRequire(import.meta.url);
let axeSrc = '';
try { axeSrc = fs.readFileSync(require_.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* not installed */ }

const NAV = 'nav:visible li > button:visible';

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function scan(page: Page, label: string, bad: string[]) {
  await frames(page);
  const run = () => page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { resultTypes: ['violations'] });
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.impact} ${v.id} x${v.nodes.length} ${v.nodes[0].target.join(' ').slice(0, 100)}`);
  });
  for (const v of await run()) bad.push(`${label}: ${v}`);
  const opened = await page.evaluate(() => { const d = [...document.querySelectorAll('main details:not([open])')] as HTMLDetailsElement[]; d.forEach((x) => { x.open = true; }); return d.length; });
  if (opened) { await frames(page); for (const v of await run()) bad.push(`${label} [open]: ${v}`); }
}

for (const theme of ['dark', 'light'] as const) {
  test(`axe: no serious/critical violations on every page and tab (${theme})`, async ({ page }) => {
    test.skip(!axeSrc, 'axe-core not installed');
    test.setTimeout(600_000);
    await page.addInitScript((th) => {
      try { localStorage.setItem('ctap.onboardingDone', '1'); localStorage.setItem('ctap.theme', th); } catch { /* ignore */ }
    }, theme);
    await page.goto('/');
    await expect(page.locator('main').first()).toBeVisible();
    await expect.poll(async () => ((await page.locator('main').first().innerText()) ?? '').trim().length).toBeGreaterThan(20);
    await page.addScriptTag({ content: axeSrc });
    const nav = page.locator(NAV);
    const labels = (await nav.allInnerTexts()).map((s) => s.trim());
    const bad: string[] = [];
    for (let i = 0; i < labels.length; i++) {
      await page.locator(NAV).nth(i).click();
      await expect.poll(async () => ((await page.locator('main').first().innerText()) ?? '').trim().length).toBeGreaterThan(20);
      if (!(await page.evaluate(() => !!(window as unknown as { axe?: unknown }).axe))) await page.addScriptTag({ content: axeSrc });
      await scan(page, `${theme} ${labels[i]}`, bad);
      const tabs = page.locator('main [role="tab"]:visible');
      const tn = await tabs.count();
      for (let t = 0; t < tn; t++) {
        try { await tabs.nth(t).click({ timeout: 10_000 }); } catch { continue; }
        await scan(page, `${theme} ${labels[i]}/tab${t}`, bad);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
}

test('(i) InfoTip: Tab reaches it, Enter/Space open, Escape closes and keeps focus', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('ctap.onboardingDone', '1'); } catch { /* ignore */ } });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible();
  const tip = page.locator('main details:has(> summary[aria-label]):has(> p) > summary').first();
  await expect(tip).toBeVisible({ timeout: 15_000 });
  await tip.focus();
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).tabIndex)).toBeGreaterThanOrEqual(0);
  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press(key);
    await expect(tip.locator('..')).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');
    await expect(tip.locator('..')).toHaveJSProperty('open', false);
    await expect(tip).toBeFocused();
  }
});

// ---- J1: UI added later (palette, journal card, update toast) in both themes and at 390px ----------------

const PAPER_KEY = 'paperTrading.v2';

function seededPaper(n: number) {
  const now = Date.now();
  const pnl = (i: number) => (i % 2 ? -900_000 : 1_400_000);
  const trades = Array.from({ length: n }, (_, i) => ({
    id: `trd_${i}`, sessionId: 'ses_a11y', instrumentId: 'NYMEX:CL', side: 'LONG', contracts: 1, entryPrice: 70, exitPrice: 70.5,
    stopLoss: 69, takeProfit: null, closeReason: 'MANUAL', grossPnlUsd: 0, feesVnd: 0, pnlUsd: 0, pnlVnd: pnl(i), rMultiple: i % 2 ? -0.8 : 1.2,
    fxRate: 25_000, journal: '', researchNoteId: '', openedAtMs: now - (i + 2) * 3_600_000, closedAtMs: now - (i + 1) * 3_600_000,
  }));
  return JSON.stringify({
    sessions: [{ id: 'ses_a11y', name: 'Phiên a11y', startingCapitalVnd: 200_000_000, balanceVnd: 200_000_000, settings: { marginPct: 10, feePerContractUsd: 2.5, slippageTicks: 1, marginCallPct: 100, stopOutPct: 50 }, status: 'active', createdAtMs: now - 86_400_000, closedAtMs: null, finalEquityVnd: null }],
    positions: [],
    trades,
  });
}

for (const theme of ['dark', 'light'] as const) {
  for (const width of [1440, 390]) {
    test(`axe: palette, journal card, update toast (${theme}, ${width}px)`, async ({ page }) => {
      test.skip(!axeSrc, 'axe-core not installed');
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.addInitScript(([th, key, seed]) => {
        try { localStorage.setItem('ctap.onboardingDone', '1'); localStorage.setItem('ctap.theme', th); localStorage.setItem(key, seed); } catch { /* ignore */ }
      }, [theme, PAPER_KEY, seededPaper(8)] as const);
      await page.goto('/');
      await expect(page.locator('main').first()).toBeVisible();
      await page.addScriptTag({ content: axeSrc });
      const bad: string[] = [];

      // 1. Palette with results.
      await page.getByTestId('palette-open').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('combobox').fill('ky quy');
      await expect(dialog.getByRole('option').first()).toBeVisible();
      await scan(page, `${theme}/${width} palette`, bad);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);

      // 2. Paper-trading stats tab (JournalCard).
      if (width < 600) await page.getByRole('button', { name: 'Mở menu điều hướng' }).click();
      await page.locator(NAV).filter({ hasText: /Của tôi/ }).first().click();
      await page.getByRole('tab', { name: /Giao dịch thử/ }).first().click();
      await page.getByRole('tab', { name: /Thống kê/ }).first().click();
      await expect(page.getByRole('heading', { name: /Nhật ký giao dịch/ }).first()).toBeVisible({ timeout: 30_000 });
      await scan(page, `${theme}/${width} journal`, bad);

      // 3. Update toast.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('ctap:sw-update', { detail: { postMessage() { /* noop */ } } })));
      await expect(page.getByRole('status').filter({ hasText: /\S/ }).last()).toBeVisible();
      await scan(page, `${theme}/${width} toast`, bad);

      expect(bad, bad.join('\n')).toEqual([]);
    });
  }
}
