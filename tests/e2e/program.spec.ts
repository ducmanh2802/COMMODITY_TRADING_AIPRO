import { test, expect, type Page } from '@playwright/test';
import { CURRICULUM } from '../../src/components/views/learn/curriculum';
import { PROGRAM } from '../../src/shared/program/threeMonth';

const ONBOARDING_KEY = 'ctap.onboardingDone';
const PROGRESS_KEY = 'learn.progress.v2';

const week1 = PROGRAM[0].lessonIds;
const lessons = new Map(CURRICULUM.flatMap((l) => l.lessons.map((x) => [x.id, x] as const)));
const lastId = week1[week1.length - 1];
const last = lessons.get(lastId)!;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function open(page: Page, seed: Record<string, string>) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(
    ({ onboarding, extra }) => {
      try {
        window.localStorage.setItem(onboarding, '1');
        if (!window.sessionStorage.getItem('e2e.seeded')) {
          for (const [k, v] of Object.entries(extra)) window.localStorage.setItem(k, v);
          window.sessionStorage.setItem('e2e.seeded', '1');
        }
      } catch {
        /* ignore */
      }
    },
    { onboarding: ONBOARDING_KEY, extra: seed }
  );
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible();
}

test('Lộ trình 3 tháng: start, see week 1 tasks, finish a lesson, task gets checked', async ({ page }) => {
  // The first three week-1 lessons are already done with a good quiz score; the last one is done in the test.
  const seeded = Object.fromEntries(week1.slice(0, -1).map((id) => [id, { done: true, best: 100 }]));
  await open(page, { [PROGRESS_KEY]: JSON.stringify({ lessons: seeded, checklist: {} }) });
  await page.locator('nav:visible li > button:visible').filter({ hasText: /Học viện/ }).first().click();
  await page.getByRole('heading', { name: 'Học viện Hàng hoá' }).waitFor();

  const card = page.getByTestId('program-card');
  await expect(card.getByRole('heading', { name: 'Lộ trình 3 tháng' })).toBeVisible();
  await card.getByTestId('program-start').click();
  await expect(page.getByTestId('program-current-week')).toContainText('Đang ở tuần 1');

  await page.getByRole('button', { name: 'Xem chi tiết lộ trình' }).click();
  const tasks = page.getByTestId('program-week-tasks');
  await expect(tasks).toBeVisible();
  await expect(page.getByTestId('task-w1.lessons')).toHaveAttribute('data-done', 'false');
  await expect(page.getByTestId('task-w1.quiz')).toHaveAttribute('data-done', 'false');
  // Self-ticked tasks are labelled as such and never auto-checked.
  await expect(page.getByText(/Đánh giá sẵn sàng/).first()).toBeVisible();
  await expect(page.getByText(/không đảm bảo lãi khi dùng tiền thật/).first()).toBeVisible();

  // Open the last lesson from the week list and pass its quiz.
  await page.getByTestId('program-week').getByRole('button', { name: new RegExp(esc(last.title)) }).first().click();
  await expect(page.getByRole('heading', { name: last.title })).toBeVisible();
  for (const qu of last.quiz) {
    const group = page.getByRole('group', { name: new RegExp('^[0-9]+[.] ' + esc(qu.q)) });
    await group.getByRole('radio').nth(qu.answer).check();
  }
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await expect(page.getByText(`Điểm: ${last.quiz.length}/${last.quiz.length} (100%)`)).toBeVisible();
  await page.getByRole('button', { name: /Về danh sách bài/ }).click();

  await page.getByRole('button', { name: 'Xem chi tiết lộ trình' }).click();
  await expect(page.getByTestId('task-w1.lessons')).toHaveAttribute('data-done', 'true');
  await expect(page.getByTestId('task-w1.quiz')).toHaveAttribute('data-done', 'true');

  // Start date persists across reload.
  await page.reload();
  await page.locator('nav:visible li > button:visible').filter({ hasText: /Học viện/ }).first().click();
  await expect(page.getByTestId('program-current-week')).toContainText('Đang ở tuần 1');
});
