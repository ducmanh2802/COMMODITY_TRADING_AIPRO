import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';

// axe-core is not a declared dependency: install it (`npm i -D axe-core`) to enable; otherwise the suite skips.
const require_ = createRequire(import.meta.url);
let axeSrc = '';
try { axeSrc = fs.readFileSync(require_.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* not installed */ }

const NAV = 'nav:visible li > button:visible';

async function scan(page: Page, label: string, bad: string[]) {
  await page.waitForTimeout(500);
  const run = () => page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { resultTypes: ['violations'] });
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.impact} ${v.id} x${v.nodes.length} ${v.nodes[0].target.join(' ').slice(0, 100)}`);
  });
  for (const v of await run()) bad.push(`${label}: ${v}`);
  const opened = await page.evaluate(() => { const d = [...document.querySelectorAll('main details:not([open])')] as HTMLDetailsElement[]; d.forEach((x) => { x.open = true; }); return d.length; });
  if (opened) { await page.waitForTimeout(300); for (const v of await run()) bad.push(`${label} [open]: ${v}`); }
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
    await page.waitForTimeout(1500);
    await page.addScriptTag({ content: axeSrc });
    const nav = page.locator(NAV);
    const labels = (await nav.allInnerTexts()).map((s) => s.trim());
    const bad: string[] = [];
    for (let i = 0; i < labels.length; i++) {
      await page.locator(NAV).nth(i).click();
      await page.waitForTimeout(400);
      if (!(await page.evaluate(() => !!(window as unknown as { axe?: unknown }).axe))) await page.addScriptTag({ content: axeSrc });
      await scan(page, `${theme} ${labels[i]}`, bad);
      const tabs = page.locator('main [role="tab"]:visible');
      const tn = await tabs.count();
      for (let t = 0; t < tn; t++) {
        try { await tabs.nth(t).click({ timeout: 2000 }); } catch { continue; }
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
