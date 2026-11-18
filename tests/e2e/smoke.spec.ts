import { test, expect } from '@playwright/test';

// Every sidebar module (ids from src/components/layout/Sidebar.tsx). The app has no login gate,
// so none are skipped. Navigation = clicking the nth sidebar button, as the app does.
const MODULES = [
  'overview', 'commodity-world', 'cycle-hunter', 'commodity-profile', 'research-report', 'learn',
  'markets', 'charts', 'ai-analyst', 'scanner', 'risk', 'portfolio', 'backtest', 'journal', 'news',
  'data-health', 'data-import', 'settings',
  'explorer', 'term-structure', 'technical', 'analysis', 'cot', 'signals', 'fundamental',
];

test('every module renders without errors or failing /api calls', async ({ page }) => {
  const problems: string[] = [];
  let current = 'load';
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

  await page.goto('/');
  const buttons = page.locator('aside nav button, aside button[aria-current], aside li > button');
  await expect(buttons.first()).toBeVisible();
  const count = await buttons.count();
  expect(count, 'sidebar buttons').toBeGreaterThanOrEqual(MODULES.length);

  for (let i = 0; i < MODULES.length; i++) {
    current = MODULES[i];
    await buttons.nth(i).click();
    await expect(buttons.nth(i)).toHaveAttribute('aria-current', 'page');
    await page.waitForLoadState('networkidle').catch(() => {});
    const main = page.locator('main');
    await expect(main, `${current}: main visible`).toBeVisible();
    await expect
      .poll(async () => ((await main.innerText()) ?? '').trim().length, { message: `${current}: main has text` })
      .toBeGreaterThan(20);
  }

  expect(problems, problems.join('\n')).toEqual([]);
});
