import { test, expect } from '@playwright/test';
import { CURRICULUM } from '../../src/components/views/learn/curriculum';

const lesson = CURRICULUM[1].lessons.find((l) => l.id === 'l2-margin-call')!;
const done = JSON.stringify({ lessons: Object.fromEntries(CURRICULUM[0].lessons.map((l) => [l.id, { done: true, best: 100 }])), checklist: {} });

test('Margin-call simulator: call and liquidation states', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((d) => {
    try {
      window.localStorage.setItem('ctap.onboardingDone', '1');
      window.localStorage.setItem('learn.progress.v2', d);
    } catch {
      /* ignore */
    }
  }, done);
  await page.goto('/');
  await page.locator('nav:visible li > button:visible').filter({ hasText: /Học viện/ }).first().click();
  await page.getByRole('button', { name: /^Cấp 2:/ }).click();
  await page.locator('main').getByRole('button', { name: new RegExp(lesson.title) }).first().click();
  const sim = page.getByTestId('margin-sim');
  await expect(sim).toBeVisible();
  const status = page.getByTestId('mcs-status');
  await expect(status).toHaveAttribute('data-status', 'ok');
  await page.getByTestId('mcs-ticks').fill('30');
  await expect(status).toHaveAttribute('data-status', 'call');
  await expect(status).toContainText('750');
  await page.getByTestId('mcs-ticks').fill('100');
  await expect(status).toHaveAttribute('data-status', 'liquidate');
});
