import { test, expect } from '@playwright/test';

// Essential sidebar modules (ids from src/components/layout/Sidebar.tsx).
const MODULES = [
  'overview',
  'commodity-world',
  'markets',
  'cycle-hunter',
  'commodity-profile',
  'research-report',
  'charts',
  'news',
  'risk',
  'data-health',
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
  const buttons = page.locator('aside nav li > button');
  await expect(buttons.first()).toBeVisible();
  const count = await buttons.count();
  expect(count, 'sidebar buttons').toBe(MODULES.length);

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
