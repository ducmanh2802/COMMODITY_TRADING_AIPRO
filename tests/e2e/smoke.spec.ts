import { test, expect, type Page } from '@playwright/test';

// Modules that need a Firebase login to render meaningfully (none today; add nav labels here).
const LOGIN_ONLY = new Set<string>([]);
const UI_MODE_KEY = 'ctap.uiMode';
const ONBOARDING_KEY = 'ctap.onboardingDone';

const NAV = 'nav:visible li > button:visible';

async function walk(page: Page, mode: 'simple' | 'pro') {
  const problems: string[] = [];
  let current = `${mode}:load`;
  page.on('pageerror', (e) => problems.push(`[${current}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${current}] console.error: ${m.text()}`);
  });
  page.on('response', (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith('/api/') && (r.status() === 404 || r.status() >= 500)) {
      problems.push(`[${current}] ${r.status()} ${url.pathname}`);
    }
  });

  await page.addInitScript(([k, v, ok, onboardingKey]) => {
    try { window.localStorage.setItem(k, v); } catch { /* ignore */ }
    try { window.localStorage.setItem(onboardingKey, ok); } catch { /* ignore */ }
  }, [UI_MODE_KEY, mode, '1', ONBOARDING_KEY]);
  await page.goto('/');
  const nav = page.locator(NAV);
  await expect(nav.first()).toBeVisible();
  // Read entries from the DOM so newly added modules/tabs are covered automatically.
  const labels = (await nav.allInnerTexts()).map((s) => s.trim());
  expect(labels.length, `${mode} nav buttons`).toBeGreaterThanOrEqual(3);

  const settle = async () => {
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    const main = page.locator('main').first();
    await expect(main, `${current}: main visible`).toBeVisible();
    await expect
      .poll(async () => ((await main.innerText()) ?? '').trim().length, { message: `${current}: main has text` })
      .toBeGreaterThan(20);
  };

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i] || `#${i}`;
    if (LOGIN_ONLY.has(label)) continue;
    current = `${mode}:${label.replace(/\s+/g, ' ')}`;
    await page.locator(NAV).nth(i).click();
    await settle();

    // Click every visible in-page tab (role=tab) of this module.
    const tabs = page.locator('main [role="tab"]:visible');
    const tn = Math.min(await tabs.count(), 12);
    for (let j = 0; j < tn; j++) {
      const t = page.locator('main [role="tab"]:visible').nth(j);
      if (!(await t.count())) break;
      const tl = ((await t.innerText().catch(() => '')) || `#${j}`).trim().replace(/\s+/g, ' ').slice(0, 30);
      current = `${mode}:${label.replace(/\s+/g, ' ')} > ${tl}`;
      await t.click({ timeout: 15_000 }).catch(() => {});
      await settle();
    }
  }
  expect(problems, problems.join('\n')).toEqual([]);
}

test('Dễ dùng mode: every nav item/tab renders without errors or failing /api calls', async ({ page }) => {
  await walk(page, 'simple');
});

test('Chuyên sâu mode: every nav item/tab renders without errors or failing /api calls', async ({ page }) => {
  await walk(page, 'pro');
});
