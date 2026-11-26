import { test, expect, type Page } from '@playwright/test';

async function skipTour(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('ctap.onboardingDone', '1'); } catch { /* ignore */ } });
}
const navBtn = (page: Page, name: RegExp) => page.locator('nav:visible li > button:visible').filter({ hasText: name }).first();

test('deep link opens the right hub, Back returns, reload keeps hub', async ({ page }) => {
  await skipTour(page);
  await page.goto('/hoc-vien');
  await expect(page.getByRole('heading', { name: 'Học viện Hàng hoá' })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveTitle(/Học viện · /);

  await navBtn(page, /Tin & vĩ mô/).click();
  await expect(page).toHaveURL(/\/tin-tuc$/);
  await expect(page).toHaveTitle(/Tin & vĩ mô · /);

  await page.goBack();
  await expect(page).toHaveURL(/\/hoc-vien$/);
  await expect(page.getByRole('heading', { name: 'Học viện Hàng hoá' })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/tin-tuc$/);

  await page.reload();
  await expect(page).toHaveURL(/\/tin-tuc$/);
  await expect(page).toHaveTitle(/Tin & vĩ mô · /);
});

test('unknown path falls back to the default hub', async ({ page }) => {
  await skipTour(page);
  await page.goto('/khong-co-trang-nay');
  await expect(page.locator('main').first()).toBeVisible();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});

test('deep link reload works offline via the service worker', async ({ page, context }) => {
  test.setTimeout(120_000);
  await skipTour(page);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto('/hoc-vien');
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Học viện Hàng hoá' })).toBeVisible({ timeout: 15_000 });
  await context.setOffline(false);
});
