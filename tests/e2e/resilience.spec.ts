import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// Resilience: every nav page + in-page tab must survive failing / empty / aborted /api responses.
const ONBOARDING_KEY = 'ctap.onboardingDone';
const NAV = 'nav:visible li > button:visible';
const RAW_LEAK = /TypeError|ReferenceError|\bundefined\b|\bNaN\b|\[object Object\]|Cannot read prop/;

type Mode = 'http500' | 'empty' | 'abort';

async function install(ctx: BrowserContext, mode: Mode) {
  await ctx.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/health') return route.continue();
    if (mode === 'abort') return route.abort('failed');
    if (mode === 'http500') {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
    }
    // empty: list-like endpoints get [], the rest {}
    const listy = /(list|history|items|news|events|series|quotes|instruments|candles|signals|entries|trades|positions|alerts)\b/i.test(url.pathname);
    return route.fulfill({ status: 200, contentType: 'application/json', body: listy ? '[]' : '{}' });
  });
}

async function walk(page: Page, mode: Mode) {
  const problems: string[] = [];
  let current = 'load';
  page.on('pageerror', (e) => problems.push(`[${current}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && /ErrorBoundary caught/.test(m.text())) problems.push(`[${current}] ErrorBoundary: ${m.text().slice(0, 600).replace(/\s+/g, ' ')}`);
  });
  await page.addInitScript(([k]) => {
    try { window.localStorage.setItem(k, '1'); } catch { /* ignore */ }
  }, [ONBOARDING_KEY]);
  await page.goto('/');
  const nav = page.locator(NAV);
  await expect(nav.first()).toBeVisible();
  const labels = (await nav.allInnerTexts()).map((s) => s.trim());

  const check = async () => {
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    const main = page.locator('main').first();
    if (!(await main.isVisible().catch(() => false))) {
      problems.push(`[${current}] main not visible`);
      return;
    }
    const text = ((await main.innerText().catch(() => '')) ?? '').trim();
    if (text.length < 20) problems.push(`[${current}] blank main (${text.length} chars)`);
    const leak = RAW_LEAK.exec(text);
    if (leak) problems.push(`[${current}] raw leak: ...${text.slice(Math.max(0, leak.index - 60), leak.index + 60).replace(/\s+/g, ' ')}...`);
    if (mode !== 'empty') {
      // API failed: no badge may claim a live/delayed price.
      const bad = await main.locator('span.rounded-full').evaluateAll((els) =>
        els.map((e) => (e.textContent ?? '').trim()).filter((s) => s === 'Giá hiện tại' || /^Giá trễ/.test(s)),
      );
      if (bad.length) problems.push(`[${current}] fabricated price badge x${bad.length}: ${bad[0]}`);
    }
  };

  for (let i = 0; i < labels.length; i++) {
    current = labels[i].replace(/\s+/g, ' ') || `#${i}`;
    try {
      await page.locator(NAV).nth(i).click({ timeout: 5000 });
    } catch {
      const body = ((await page.locator('body').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').slice(0, 400);
      problems.push(`[${current}] nav gone (app crashed?): ${body}`);
      await page.goto('/');
      await page.locator(NAV).first().waitFor({ timeout: 5000 }).catch(() => {});
      continue;
    }
    await check();
    const tabs = page.locator('main [role="tab"]:visible');
    const tn = Math.min(await tabs.count(), 12);
    for (let j = 0; j < tn; j++) {
      const t = page.locator('main [role="tab"]:visible').nth(j);
      if (!(await t.count())) break;
      const tl = ((await t.innerText().catch(() => '')) || `#${j}`).trim().replace(/\s+/g, ' ').slice(0, 30);
      current = `${labels[i].replace(/\s+/g, ' ')} > ${tl}`;
      await t.click({ timeout: 5000 }).catch(() => {});
      await check();
    }
  }
  // Known open bug (CommodityWorldView.tsx reads overview.commodities.length on an empty {} payload);
  // remove this filter once that file is hardened.
  const real = problems;
  expect(real, real.join('\n')).toEqual([]);
}

for (const mode of ['http500', 'empty', 'abort'] as const) {
  test(`resilience: ${mode} on every page/tab`, async ({ browser }) => {
    const ctx = await browser.newContext();
    await install(ctx, mode);
    const page = await ctx.newPage();
    try {
      await walk(page, mode);
    } finally {
      await ctx.close();
    }
  });
}
