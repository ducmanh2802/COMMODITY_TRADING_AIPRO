import { test, expect } from '@playwright/test';

// Modules that need a Firebase login to render meaningfully (none in the sidebar today; add ids here).
const LOGIN_ONLY = new Set<string>([]);

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
  // Read nav entries from the DOM so newly added modules are covered automatically.
  const count = await buttons.count();
  expect(count, 'sidebar buttons').toBeGreaterThanOrEqual(10);

  for (let i = 0; i < count; i++) {
    const label = ((await buttons.nth(i).innerText()) || '').trim() || `#${i}`;
    if (LOGIN_ONLY.has(label)) continue;
    current = label;
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
