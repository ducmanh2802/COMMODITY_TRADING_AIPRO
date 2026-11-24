import { test, expect, type Page } from '@playwright/test';
import { CURRICULUM } from '../../src/components/views/learn/curriculum';
import { drawExam } from '../../src/components/views/learn/exam/examLogic';
import { hashQuestion } from '../../src/components/views/learn/review';

const ONBOARDING_KEY = 'ctap.onboardingDone';
const PROGRESS_KEY = 'learn.progress.v2';
const REVIEW_KEY = 'ctap.review.v1';

type Seed = Record<string, string>;

async function open(page: Page, seed: Seed = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Seed only on the first load of each test so in-test reloads keep what the app wrote.
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

async function nav(page: Page, name: RegExp) {
  await page.locator('nav:visible li > button:visible').filter({ hasText: name }).first().click();
}

const level1 = CURRICULUM[0];
const lesson1 = level1.lessons[0];

function allDone(level = level1) {
  return JSON.stringify({ lessons: Object.fromEntries(level.lessons.map((l) => [l.id, { done: true, best: 100 }])), checklist: {} });
}

test('Học viện: open a lesson, answer its quiz, lesson gets marked done', async ({ page }) => {
  await open(page);
  await nav(page, /Học viện/);
  await page.getByRole('heading', { name: 'Học viện Hàng hoá' }).waitFor();
  await page.locator('main').getByRole('button', { name: new RegExp(lesson1.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  await expect(page.getByRole('heading', { name: lesson1.title })).toBeVisible();

  // Submit is disabled until every question is answered.
  const submit = page.getByRole('button', { name: 'Nộp bài' });
  await expect(submit).toBeDisabled();
  for (const qu of lesson1.quiz) {
    const group = page.getByRole('group', { name: new RegExp(`^\\d+\\. ${qu.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
    await group.getByRole('radio').nth(qu.answer).check();
  }
  await expect(submit).toBeEnabled();
  await submit.click();

  // Feedback: score badge + explanations.
  await expect(page.getByText(`Điểm: ${lesson1.quiz.length}/${lesson1.quiz.length} (100%)`)).toBeVisible();
  await expect(page.getByText(/^Giải thích:/).first()).toBeVisible();
  await expect(page.getByText('Điểm cao nhất: 100%')).toBeVisible();

  // Passing the quiz stores the lesson as done.
  const stored = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? '{}'), PROGRESS_KEY);
  expect(stored.lessons[lesson1.id]).toMatchObject({ done: true, best: 100 });

  // And it shows on the home list.
  await page.getByRole('button', { name: /Về danh sách bài/ }).click();
  await expect(page.locator('main').getByText('Đã học').first()).toBeVisible();
});

test('Học viện: all-wrong quiz answers show 0%, do not mark done and feed spaced review', async ({ page }) => {
  await open(page);
  await nav(page, /Học viện/);
  await page.locator('main').getByRole('button', { name: new RegExp(lesson1.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  for (const qu of lesson1.quiz) {
    const wrong = (qu.answer + 1) % qu.options.length;
    const group = page.getByRole('group', { name: new RegExp(`^\\d+\\. ${qu.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
    await group.getByRole('radio').nth(wrong).check();
  }
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await expect(page.getByText(`Điểm: 0/${lesson1.quiz.length} (0%)`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Làm lại' })).toBeVisible();
  const stored = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? '{}'), PROGRESS_KEY);
  expect(stored.lessons[lesson1.id]?.done).not.toBe(true);
  // Wrong answers feed spaced review.
  const review = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? '{}'), REVIEW_KEY);
  expect(Object.keys(review.items ?? {}).length).toBe(lesson1.quiz.length);
});

test('level 1 exam: unlocked at 80%, answer all, pass, certificate PDF downloads', async ({ page }) => {
  // 80% of the level's lessons done (rounded up) is enough to unlock.
  const need = Math.ceil(level1.lessons.length * 0.8);
  const progress = JSON.stringify({ lessons: Object.fromEntries(level1.lessons.slice(0, need).map((l) => [l.id, { done: true, best: 100 }])), checklist: {} });
  await open(page, { [PROGRESS_KEY]: progress });
  await nav(page, /Học viện/);

  const section = page.locator(`section[aria-labelledby="h-${level1.id}"]`);
  await section.getByRole('button', { name: 'Làm bài kiểm tra' }).click();
  await expect(page.getByRole('heading', { name: new RegExp('Bài kiểm tra cuối cấp') })).toBeVisible();

  const questions = drawExam(level1, 0);
  await expect(page.getByText(`Đã trả lời 0/${questions.length} câu`)).toBeVisible();
  const items = page.locator('ol > li');
  await expect(items).toHaveCount(questions.length);
  for (let i = 0; i < questions.length; i++) {
    await items.nth(i).getByRole('radio').nth(questions[i].question.answer).check();
  }
  await expect(page.getByText(`Đã trả lời ${questions.length}/${questions.length} câu`)).toBeVisible();
  await page.getByRole('button', { name: 'Nộp bài' }).click();

  await expect(page.getByText('Kết quả', { exact: true })).toBeVisible();
  await expect(page.getByText(`${questions.length}/${questions.length} câu đúng, 100%`)).toBeVisible();
  await expect(page.getByText(/^Đạt \(từ 80%\)/)).toBeVisible();

  // Certificate: needs a name, then fires a .pdf download.
  await page.getByRole('button', { name: /Tải chứng nhận/ }).click();
  await expect(page.getByText('Nhập họ tên để tải chứng nhận.')).toBeVisible();
  await page.getByLabel('Họ tên trên chứng nhận').fill('Nguyen Van Test');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('button', { name: /Tải chứng nhận/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect(download.suggestedFilename()).toContain(level1.id);

  // Result persisted: the level card reports it as passed.
  const exams = await page.evaluate(() => JSON.parse(window.localStorage.getItem('ctap.exams.v1') ?? '{}'));
  expect(exams.exams[level1.id]).toMatchObject({ passed: true, best: 100 });
});

test('level 1 exam: locked below 80% and a failed attempt shows the fail result without a certificate', async ({ page }) => {
  await open(page);
  await nav(page, /Học viện/);
  const section = page.locator(`section[aria-labelledby="h-${level1.id}"]`);
  await expect(section.getByText(/Mở khoá khi hoàn thành ít nhất 80%/)).toBeVisible();
  await expect(section.getByRole('button', { name: 'Làm bài kiểm tra' })).toHaveCount(0);

  await page.reload();
  await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [PROGRESS_KEY, allDone()]);
  await page.reload();
  await nav(page, /Học viện/);
  await section.getByRole('button', { name: 'Làm bài kiểm tra' }).click();
  const questions = drawExam(level1, 0);
  const items = page.locator('ol > li');
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i].question;
    await items.nth(i).getByRole('radio').nth((q.answer + 1) % q.options.length).check();
  }
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await expect(page.getByText(`0/${questions.length} câu đúng, 0%`)).toBeVisible();
  await expect(page.getByText(/^Chưa đạt/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Tải chứng nhận/ })).toHaveCount(0);
});

test('spaced review: a wrong answer due now shows in "Ôn tập hôm nay" and can be reviewed', async ({ page }) => {
  const lesson = lesson1;
  const qu = lesson.quiz[0];
  const item = { id: `${lesson.id}:${hashQuestion(qu.q)}`, lessonId: lesson.id, qHash: hashQuestion(qu.q), box: 1, due: Date.now() - 60_000 };
  await open(page, { [REVIEW_KEY]: JSON.stringify({ version: 1, items: { [item.id]: item } }) });
  await nav(page, /Học viện/);
  await expect(page.getByText('Ôn tập hôm nay (1 câu)')).toBeVisible();
  await page.getByRole('button', { name: 'Bắt đầu ôn' }).click();
  await expect(page.getByText(qu.q)).toBeVisible();
  await page.getByRole('radio').nth(qu.answer).check();
  await expect(page.getByText(/Giải thích/).first()).toBeVisible();
});

test('spaced review: nothing due shows the empty state', async ({ page }) => {
  await open(page);
  await nav(page, /Học viện/);
  await expect(page.getByText('Không có câu cần ôn hôm nay')).toBeVisible();
});

// ---- Replay + paper trading: market data is mocked (deterministic, offline) -------------------------------------

function fakeCandles(n: number) {
  const out = [];
  const start = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) {
    const d = new Date(start + i * 86_400_000).toISOString();
    const close = 100 + (i % 7) * 0.1;
    out.push({ timestamp: d, open: close, high: close + 0.5, low: close - 0.5, close, volume: 1000 });
  }
  return out;
}

async function openMine(page: Page, tab: RegExp) {
  await nav(page, /Của tôi/);
  await page.getByRole('tab', { name: /Giao dịch thử/ }).first().click();
  if (tab.source !== 'Giao dịch') await page.getByRole('tab', { name: tab }).first().click();
}

test('bar replay: start, step candles, progress label updates, practice order fills', async ({ page }) => {
  await page.route('**/api/market/candles/**', (route) => route.fulfill({ json: { candles: fakeCandles(400) } }));
  await open(page);
  await openMine(page, /Luyện trên dữ liệu quá khứ/);
  await expect(page.getByRole('heading', { name: 'Luyện tập trên dữ liệu quá khứ' })).toBeVisible();

  await page.locator('#rp-inst option').first().waitFor({ state: 'attached' });
  await page.locator('#rp-date').fill('2024-07-01');
  await page.getByRole('button', { name: /^Bắt đầu/ }).click();

  const bar = page.getByText(/^Đã lộ \d+\/\d+ nến ngày$/);
  await expect(bar).toBeVisible();
  await expect(bar).toHaveText(/^Đã lộ 0\//);
  await expect(page.getByText('Đang không giữ lệnh.')).toBeVisible();

  const next = page.getByRole('button', { name: 'Nến tiếp' });
  await next.click();
  await next.click();
  await next.click();
  await expect(bar).toHaveText(/^Đã lộ 3\//);

  // Practice order: needs stop+target, then fills at the next candle open.
  await page.getByRole('button', { name: 'Mua', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Phải nhập cả cắt lỗ và chốt lời' })).toBeVisible();
  await page.locator('#rp-stop').fill('90');
  await page.locator('#rp-target').fill('110');
  await page.getByRole('button', { name: 'Mua', exact: true }).click();
  await expect(page.getByText(/^Lệnh .* chờ khớp/)).toBeVisible();
  await next.click();
  await expect(page.getByText(/^Đang giữ .* 1 hợp đồng/)).toBeVisible();
  await expect(bar).toHaveText(/^Đã lộ 4\//);
  await page.getByRole('button', { name: 'Đóng lệnh' }).click();
  await expect(page.getByText('Đang không giữ lệnh.')).toBeVisible();

  await page.getByRole('button', { name: /Kết thúc/ }).click();
  await expect(page.getByRole('heading', { name: /Kết quả/ }).first()).toBeVisible();
});

test('bar replay: not enough history shows the clear empty state', async ({ page }) => {
  await page.route('**/api/market/candles/**', (route) => route.fulfill({ json: { candles: fakeCandles(50) } }));
  await open(page);
  await openMine(page, /Luyện trên dữ liệu quá khứ/);
  await page.getByRole('button', { name: /^Bắt đầu/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: /chưa đủ lịch sử ngày/ })).toBeVisible();
  await expect(page.getByText(/^Đã lộ /)).toHaveCount(0);
});

test('paper trading (signed out, local): place order with stop, see position, close it', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  const instRes = await page.request.get('/api/instruments');
  const { instruments } = (await instRes.json()) as {
    instruments: { id: string; enabled: boolean; exchangeSymbol: string; productName: string; specification: { minimumTickSize: number | null; tickValue: number | null; contractSize: number | null; tradingCurrency: string; verificationStatus: string } }[];
  };
  const usable = instruments.find(
    (i) => i.enabled && i.specification.minimumTickSize && i.specification.tickValue && i.specification.contractSize !== null && i.specification.tradingCurrency === 'USD' && i.specification.verificationStatus === 'VERIFIED'
  );
  test.skip(!usable, 'no instrument with a verified USD spec in the instrument master');
  if (!usable) return;

  const price = 1000;
  await page.route('**/api/market/quotes', (route) =>
    route.fulfill({
      json: {
        quotes: [
          {
            symbol: usable.exchangeSymbol,
            exchange: 'TEST',
            contractMonth: null,
            price,
            bid: null,
            ask: null,
            volume: null,
            openInterest: null,
            currency: 'USD',
            unit: '',
            source: 'e2e-fixture',
            timestamp: new Date().toISOString(),
            retrievedAt: new Date().toISOString(),
            status: 'CURRENT',
          },
        ],
      },
    })
  );
  await page.route('**/api/macro/fx', (route) =>
    route.fulfill({ json: { items: [{ id: 'USDVND_VCB', value: 25000, status: 'CURRENT', asOf: new Date().toISOString() }] } })
  );
  await open(page);
  await openMine(page, /Giao dịch$/);

  await expect(page.getByText(/dữ liệu chỉ lưu trên trình duyệt này/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Tạo phiên mới' }).click();
  await expect(page.getByRole('heading', { name: /Giao dịch thử/ }).first()).toBeVisible();

  await page.locator('#pt-inst').selectOption(usable.id);
  await expect(page.getByText(/Giá mới nhất/)).toContainText(/1\D?000\D00/);
  await page.locator('#pt-qty').fill('1');
  await page.locator('#pt-sl').fill(String(price * 0.9));
  await page.getByRole('button', { name: /Xem lại & đặt lệnh/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Xác nhận lệnh thử' });
  await expect(dialog).toBeVisible();
  // The confirm dialog is where a warning-gated flow may rename the button; accept either label.
  await dialog.getByRole('button', { name: /Xác nhận đặt lệnh|Vẫn tiếp tục/ }).click();

  await expect(page.getByText('Đã khớp lệnh thử.')).toBeVisible();
  const positions = page.locator('li').filter({ hasText: /SL \d/ });
  await expect(positions).toHaveCount(1);
  await expect(positions.first()).toContainText(`SL ${price * 0.9}`);

  await page.getByRole('button', { name: 'ĐÓNG VỊ THẾ' }).click();
  await expect(page.getByText('Đã đóng vị thế.')).toBeVisible();
  await expect(page.getByText(/Chưa có vị thế nào/)).toBeVisible();
});
