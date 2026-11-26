import { test, expect } from '@playwright/test';

// Requires the production build (webServer in playwright.config.ts runs build + start).
test('PWA: manifest served, SW registers, shell loads offline', async ({ page, context, request }) => {
  await page.addInitScript(() => { try { localStorage.setItem('ctap.onboardingDone', '1'); } catch { /* ignore */ } });

  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.lang).toBe('vi');

  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Reload so the page is controlled and lazy assets are cached by the SW.
  await page.reload();
  await expect(page.locator('main').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('main').first()).toBeVisible();
  await expect(page.locator('#root')).not.toBeEmpty();

  // API must never be served from the SW cache.
  const keys = await page.evaluate(async () => {
    const out: string[] = [];
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(keys.some((k) => k.startsWith('/api/'))).toBe(false);
  await context.setOffline(false);
});

test('PWA: Academy hub and a lesson render offline after one online visit', async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => { try { localStorage.setItem('ctap.onboardingDone', '1'); } catch { /* ignore */ } });
  const openAcademy = async () => {
    await page.locator('nav:visible li > button:visible').filter({ hasText: /Học viện/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Học viện Hàng hoá' })).toBeVisible({ timeout: 15_000 });
  };
  const openLesson = async () => {
    await page.getByTestId('lesson-card-l1-margin').click();
    await expect(page.getByRole('button', { name: 'Nộp bài' })).toBeVisible({ timeout: 15_000 });
  };

  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await openAcademy();
  await openLesson();
  await page.waitForLoadState('networkidle');

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('main').first()).toBeVisible();
  await openAcademy();
  await openLesson();
  await expect(page.locator('main')).toContainText(/ký quỹ/i);
  await context.setOffline(false);
});
