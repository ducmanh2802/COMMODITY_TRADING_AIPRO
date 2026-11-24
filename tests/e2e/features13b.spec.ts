import { test, expect, type Page } from '@playwright/test';

const ONBOARDING_KEY = 'ctap.onboardingDone';

async function open(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((k) => {
    try { window.localStorage.setItem(k, '1'); } catch { /* ignore */ }
  }, ONBOARDING_KEY);
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible();
}

async function nav(page: Page, name: RegExp) {
  await page.locator('nav:visible li > button:visible').filter({ hasText: name }).first().click();
}

test('contest tab renders and asks for sign-in', async ({ page }) => {
  await open(page);
  await nav(page, /Của tôi/);
  await page.getByRole('tab', { name: /Giao dịch thử/ }).first().click();
  await page.getByRole('tab', { name: /Cuộc đua/ }).first().click();
  const main = page.locator('main').first();
  await expect(main.getByText('Thể lệ').first()).toBeVisible();
  await expect(main.getByText('Đăng nhập Google để tham gia cuộc đua.')).toBeVisible();
  expect(await main.innerText()).not.toMatch(/\bct\.[a-z]+/);
});

test('push and email cards show the unconfigured state', async ({ page }) => {
  await open(page);
  await nav(page, /Giá & thị trường/);
  await page.locator('main').getByRole('button', { name: /Mã theo dõi/ }).first().click();
  const main = page.locator('main').first();
  await expect(main.getByText('Thông báo trên trình duyệt').first()).toBeVisible();
  await expect(main.getByText(/Chưa bật trên máy chủ/).first()).toBeVisible();
  expect(await main.innerText()).not.toMatch(/\bpush\.[a-z]+/);
});

test('TopBar overflow menu opens and theme toggle works', async ({ page }) => {
  await open(page, 1100);
  await page.getByRole('button', { name: 'Thêm tùy chọn' }).click();
  const region = page.getByRole('dialog', { name: 'Giao diện và ngôn ngữ' });
  await expect(region).toBeVisible();
  await region.getByRole('button', { name: 'Sáng' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await region.getByRole('button', { name: 'Tối' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Escape');
  await expect(region).toBeHidden();
});
