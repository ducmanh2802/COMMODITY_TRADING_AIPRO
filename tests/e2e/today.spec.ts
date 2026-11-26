import { test, expect, type Page } from '@playwright/test';

async function load(page: Page, progress?: unknown) {
  await page.addInitScript((p) => {
    try {
      window.localStorage.setItem('ctap.onboardingDone', '1');
      if (p) window.localStorage.setItem('learn.progress.v2', JSON.stringify(p));
    } catch { /* ignore */ }
  }, progress);
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible();
}

test('Today "Học tiếp": new user starts lesson 1, returning user resumes next lesson', async ({ page }) => {
  await load(page);
  const card = page.getByTestId('today-continue');
  await expect(card).toBeVisible();
  const go = page.getByTestId('today-continue-go');
  await expect(go).toContainText(/bắt đầu bài 1|start lesson 1/i);
  expect((await go.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await go.click();
  await expect(page.getByTestId('lesson-practice').or(page.getByRole('heading', { level: 1 }).first())).toBeVisible();
  await expect(page.locator('body')).toContainText(/hàng hoá là gì|what is a commodity/i);
});

test('Today "Học tiếp": progress moves to the next lesson', async ({ page }) => {
  await load(page, { lessons: { 'l1-commodity': { done: true } }, checklist: {} });
  await expect(page.getByTestId('today-continue-go')).toContainText(/học tiếp|continue/i);
  await expect(page.getByTestId('today-continue')).not.toContainText('Hàng hoá là gì?');
  await expect(page.getByTestId('today-continue')).toContainText(/1\//);
});

test('lesson PracticeCard (l1-margin): sandbox button opens Academy sandbox tab; risk button leaves lesson', async ({ page }) => {
  await load(page);
  const open = async () => {
    await page.getByTestId('palette-open').click();
    const dialog = page.getByRole('dialog', { name: /tìm nhanh|quick search/i });
    await dialog.getByRole('combobox').fill('Ky quy ban dau, duy tri va don bay');
    await dialog.locator('[data-kind="lesson"]').first().click();
    await expect(page.getByTestId('lesson-practice')).toBeVisible({ timeout: 20000 });
  };
  await open();
  await expect(page.getByTestId('practice-sandbox')).toBeVisible();
  await page.getByTestId('practice-sandbox').click();
  await expect(page.getByTestId('lesson-practice')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /sandbox|thực hành|máy tính/i }).first()).toHaveAttribute('aria-selected', 'true');

  await open();
  await page.getByTestId('practice-risk').click();
  await expect(page.getByTestId('lesson-practice')).toHaveCount(0);
  await expect(page.locator('main').first()).toBeVisible();
});
