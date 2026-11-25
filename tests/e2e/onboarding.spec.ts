import { test, expect, type Page } from '@playwright/test';

const KEY = 'ctap.onboardingDone';
const TOTAL = 5;

async function open(page: Page) {
  await page.addInitScript((k) => {
    try { if (!sessionStorage.getItem('ob-init')) { localStorage.removeItem(k); sessionStorage.setItem('ob-init', '1'); } } catch { /* ignore */ }
  }, KEY);
  await page.goto('/');
  await expect(page.getByRole('dialog').first()).toBeVisible();
}

const flag = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY);

for (const vp of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('walk all steps with Next/Back, on-screen, focus inside, finish sets flag', async ({ page }) => {
      await open(page);
      const dlg = page.getByRole('dialog').first();
      for (let n = 1; n <= TOTAL; n++) {
        await expect(dlg).toContainText(`${n}/${TOTAL}`);
        await expect(dlg.locator('h2')).toBeVisible();
        const box = await dlg.locator('> div').boundingBox();
        expect(box, `step ${n} box`).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 0.5);
        expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 0.5);
        expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
        const text = (await dlg.innerText()).toLowerCase();
        expect(text).not.toMatch(/tổng quan|cycle|dễ dùng|chuyên sâu/);
        if (n < TOTAL) await dlg.getByRole('button', { name: 'Tiếp theo' }).click();
      }
      await dlg.getByRole('button', { name: 'Quay lại' }).click();
      await expect(dlg).toContainText(`${TOTAL - 1}/${TOTAL}`);
      await dlg.getByRole('button', { name: 'Tiếp theo' }).click();
      expect(await flag(page)).toBeNull();
      await dlg.getByRole('button', { name: 'Xong' }).click();
      await expect(page.getByRole('dialog', { name: /Đăng nhập Google/ })).toHaveCount(0);
      expect(await flag(page)).toBe('1');
    });

    test('Skip and Escape set flag; go buttons land on visible target', async ({ page }) => {
      await open(page);
      await page.getByRole('button', { name: 'Bỏ qua' }).click();
      expect(await flag(page)).toBe('1');

      await page.evaluate((k) => localStorage.removeItem(k), KEY);
      await page.goto('/');
      await expect(page.getByRole('dialog').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await flag(page)).toBe('1');

      for (const [step, go] of [[2, 'Xem giá'], [3, 'Mở Học viện'], [4, 'Mở khu của tôi']] as const) {
        await page.evaluate((k) => localStorage.removeItem(k), KEY);
        await page.goto('/');
        const dlg = page.getByRole('dialog').first();
        for (let i = 1; i < step; i++) await dlg.getByRole('button', { name: 'Tiếp theo' }).click();
        await dlg.getByRole('button', { name: go }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.locator('main')).toBeVisible();
        expect(((await page.locator('main').innerText()).trim().length)).toBeGreaterThan(20);
      }
    });
  });
}
