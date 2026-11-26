import { test, expect, type Page } from '@playwright/test';

const ONBOARDING_KEY = 'ctap.onboardingDone';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function boot(page: Page) {
  await page.addInitScript((k) => {
    try { window.localStorage.setItem(k, '1'); } catch { /* ignore */ }
  }, ONBOARDING_KEY);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Mở menu điều hướng' })).toBeVisible();
}

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('mobile nav: hamburger opens drawer, picking a page closes it', async ({ page }) => {
  await boot(page);
  const aside = page.locator('aside');
  await expect(aside).toHaveJSProperty('inert', true);
  await page.getByRole('button', { name: 'Mở menu điều hướng' }).click();
  await expect(aside).toHaveJSProperty('inert', false);
  await aside.locator('nav ul').first().locator('button').nth(2).click();
  await expect(aside).toHaveJSProperty('inert', true);
  await expect(page.locator('main').first()).toBeVisible();
});

test('mobile: no horizontal overflow on main pages and tabs', async ({ page }) => {
  await boot(page);
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: 'Mở menu điều hướng' }).click();
    await page.locator('aside nav ul').first().locator('button').nth(i).click();
    await expect(page.locator('aside')).toHaveJSProperty('inert', true);
    await expect.poll(() => noOverflow(page), { message: `section #${i}` }).toBe(true);
    const tabs = page.locator('main [role="tab"]:visible');
    const n = Math.min(await tabs.count(), 8);
    for (let j = 0; j < n; j++) {
      await page.locator('main [role="tab"]:visible').nth(j).click({ timeout: 10_000 }).catch(() => {});
      await expect.poll(() => noOverflow(page), { message: `section #${i} tab #${j}` }).toBe(true);
    }
  }
});
