import { test, expect, type Page } from '@playwright/test';

async function load(page: Page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('ctap.onboardingDone', '1'); } catch { /* ignore */ }
  });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible();
  await expect(page.getByTestId('palette-open')).toBeVisible();
}

test('Ctrl+K opens palette, diacritic-insensitive search, Enter navigates, Escape restores focus', async ({ page }) => {
  await load(page);
  const btn = page.getByTestId('palette-open');
  await btn.focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: /tìm nhanh|quick search/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  const input = dialog.getByRole('combobox');
  await expect(input).toBeFocused();

  // Escape closes and returns focus to the trigger.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(btn).toBeFocused();

  // Button opens; "ky quy" (no marks) finds a lesson about "Ký quỹ".
  await btn.click();
  await expect(input).toBeFocused();
  await input.fill('ky quy');
  const options = dialog.getByRole('option');
  await expect(options.first()).toBeVisible();
  await expect(dialog.locator('[data-kind="lesson"]').first()).toContainText(/ký quỹ/i);
  await expect(input).toHaveAttribute('aria-activedescendant', /opt-0$/);
  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', /opt-1$/);
  await page.keyboard.press('ArrowUp');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
});

test('searching a page name and pressing Enter opens it; lesson opens in Academy', async ({ page }) => {
  await load(page);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').fill('hoc vien');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('lesson-card-l1-margin')).toBeVisible();

  await page.keyboard.press('Control+k');
  await page.getByRole('dialog').getByRole('combobox').fill('Ký quỹ ban đầu');
  await page.getByRole('dialog').locator('[data-kind="lesson"]').first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('main')).toContainText(/ký quỹ/i);
});

test('Tab stays inside the dialog', async ({ page }) => {
  await load(page);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  expect(inside).toBe(true);
  await expect(dialog).toBeVisible();
});

test('picking a glossary term scrolls to it and highlights it', async ({ page }) => {
  await load(page);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').fill('Bước giá (Tick)');
  await dialog.locator('[data-kind="term"]').first().click();
  await expect(dialog).toHaveCount(0);
  const entry = page.locator('[data-term="Bước giá (Tick)"]');
  await expect(entry).toBeVisible();
  await expect(entry).toBeInViewport();
});
