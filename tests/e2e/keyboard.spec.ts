import { test, expect, type Page } from '@playwright/test';

async function load(page: Page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('ctap.onboardingDone', '1'); } catch { /* ignore */ }
  });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible();
}

test('skip link moves focus to main content', async ({ page }) => {
  await load(page);
  const skip = page.locator('a[href="#main-content"]');
  await expect(skip).toHaveCount(1);
  // Headless window has no OS focus, so Tab from nowhere is unreliable: assert it is first in tab order, then focus it.
  const firstId = await page.evaluate(() => document.querySelector<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')?.getAttribute('href'));
  expect(firstId).toBe('#main-content');
  await skip.focus();
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('mobile drawer traps focus, Escape closes and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await load(page);
  const opener = page.getByRole('button', { name: 'Mở menu điều hướng' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Điều hướng' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement?.closest('aside[role="dialog"]'));
    expect(inside, `Tab ${i} stayed inside drawer`).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('aside[role="dialog"]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('aside[role="dialog"]')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('TopBar overflow menu: Escape closes and returns focus to trigger', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await load(page);
  const more = page.getByRole('button', { name: 'Thêm tùy chọn' });
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toBeFocused();
});

test('tablist: arrow keys move selection', async ({ page }) => {
  await load(page);
  await page.locator('nav:visible li > button:visible', { hasText: 'Học viện' }).first().click();
  await page.getByRole('button', { name: /^Thuật ngữ/ }).click();
  const tabs = page.locator('main [role="tablist"]:visible').first().locator('[role="tab"]');
  expect(await tabs.count()).toBeGreaterThanOrEqual(2);
  await tabs.first().focus();
  await tabs.first().click();
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  // roving tabindex: only the selected tab is in the Tab order
  await expect(tabs.first()).toHaveAttribute('tabindex', '0');
  await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toHaveAttribute('tabindex', '0');
  await expect(tabs.first()).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
});
