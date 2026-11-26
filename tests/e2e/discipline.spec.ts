import { test, expect, type Page } from '@playwright/test';

// Paper-trading discipline features: forced cool-off, mistake tags, weekly review, event-risk banner.
// Market data is mocked (deterministic, offline). Each test runs in a fresh browser context.

const ONBOARDING_KEY = 'ctap.onboardingDone';
const PAPER_KEY = 'paperTrading.v2';

type Seed = Record<string, string>;

interface InstrumentRow {
  id: string;
  enabled: boolean;
  exchangeSymbol: string;
  specification: { minimumTickSize: number | null; tickValue: number | null; contractSize: number | null; tradingCurrency: string; verificationStatus: string };
}

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

/** "Của tôi" → "Giao dịch thử" → inner tab (Giao dịch / Thống kê ...). */
async function openPaper(page: Page, tab: RegExp = /^Giao dịch$/) {
  await nav(page, /Của tôi/);
  await page.getByRole('tab', { name: /Giao dịch thử/ }).first().click();
  await page.getByRole('tab', { name: tab }).first().click();
}

async function crudeInstrument(page: Page): Promise<InstrumentRow | undefined> {
  const res = await page.request.get('/api/instruments');
  const { instruments } = (await res.json()) as { instruments: InstrumentRow[] };
  const ok = (i: InstrumentRow) =>
    i.enabled && !!i.specification.minimumTickSize && !!i.specification.tickValue && i.specification.contractSize !== null && i.specification.tradingCurrency === 'USD' && i.specification.verificationStatus === 'VERIFIED';
  return instruments.find((i) => i.exchangeSymbol === 'CL' && ok(i)) ?? instruments.find((i) => i.exchangeSymbol === 'BRN' && ok(i));
}

async function mockMarket(page: Page, symbol: string, price: number) {
  await page.route('**/api/market/quotes', (route) =>
    route.fulfill({
      json: {
        quotes: [
          {
            symbol,
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
}

// ---- seeded local paper state -------------------------------------------------------------------------------

const SESSION_ID = 'ses_e2e';
const CAPITAL = 200_000_000;

function seededState(trades: { id: string; pnlVnd: number; minutesAgo: number }[], instrumentId = 'NYMEX:CL') {
  const now = Date.now();
  return JSON.stringify({
    sessions: [
      {
        id: SESSION_ID,
        name: 'Phiên e2e',
        startingCapitalVnd: CAPITAL,
        balanceVnd: CAPITAL + trades.reduce((s, t) => s + t.pnlVnd, 0),
        settings: { marginPct: 10, feePerContractUsd: 2.5, slippageTicks: 1, marginCallPct: 100, stopOutPct: 50 },
        status: 'active',
        createdAtMs: now - 3_600_000,
        closedAtMs: null,
        finalEquityVnd: null,
      },
    ],
    positions: [],
    trades: trades.map((t) => {
      const pnlUsd = t.pnlVnd / 25_000;
      return {
        id: t.id,
        sessionId: SESSION_ID,
        instrumentId,
        side: 'LONG',
        contracts: 1,
        entryPrice: 70,
        exitPrice: 70 + pnlUsd / 1000,
        stopLoss: 69,
        takeProfit: null,
        closeReason: 'MANUAL',
        grossPnlUsd: pnlUsd,
        feesVnd: 0,
        pnlUsd,
        pnlVnd: t.pnlVnd,
        rMultiple: null,
        fxRate: 25_000,
        journal: '',
        researchNoteId: '',
        openedAtMs: now - t.minutesAgo * 60_000 - 60_000,
        closedAtMs: now - t.minutesAgo * 60_000,
      };
    }),
  });
}

// ---- 1. cool-off --------------------------------------------------------------------------------------------

test('cool-off: 3 losing paper trades pause new orders, closing still allowed, switch off re-enables', async ({ page }) => {
  page.on('dialog', (d) => void d.accept()); // window.confirm on close
  const crude = await crudeInstrument(page);
  test.skip(!crude, 'no enabled CL/BRN instrument with a verified USD spec in /api/instruments');
  if (!crude) return;

  const price = 10; // small contract value so two positions fit in the default margin
  await mockMarket(page, crude.exchangeSymbol, price);
  await open(page);
  await openPaper(page);
  await page.getByRole('button', { name: 'Tạo phiên mới' }).click();
  await page.locator('#pt-inst').selectOption(crude.id);
  await expect(page.getByText(/Giá mới nhất/)).toContainText(/10\D00/);

  const banner = page.getByRole('status').filter({ has: page.getByRole('heading', { name: 'Tạm nghỉ đặt lệnh mới' }) });
  const dialog = page.getByRole('dialog', { name: 'Xác nhận lệnh thử' });
  const positions = page.locator('li').filter({ hasText: /SL \d/ });
  const review = page.getByRole('button', { name: /Xem lại & đặt lệnh/ });

  const place = async (expectedOpen: number) => {
    await page.locator('#pt-qty').fill('1');
    await page.locator('#pt-sl').fill('9.9');
    await review.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Xác nhận đặt lệnh|Vẫn tiếp tục/ }).click();
    await expect(dialog).toBeHidden();
    await expect(positions).toHaveCount(expectedOpen);
  };
  const closeOne = async (expectedOpen: number) => {
    await page.getByRole('button', { name: 'ĐÓNG VỊ THẾ' }).first().click();
    await expect(positions).toHaveCount(expectedOpen);
  };

  // Two round trips at a constant price: fees + slippage make each a small loss.
  await place(1);
  await closeOne(0);
  await place(1);
  await closeOne(0);
  await expect(banner).toHaveCount(0);

  // Third loss, with a fourth position still open.
  await place(1);
  await place(2);
  await closeOne(1);

  // Banner appears immediately after the 3rd consecutive loss.
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Bạn vừa thua 3 lệnh thử liên tiếp.');

  // New order is blocked: no confirm dialog, clear message instead.
  await page.locator('#pt-qty').fill('1');
  await page.locator('#pt-sl').fill('9.9');
  await review.click();
  await expect(page.getByRole('alert').filter({ hasText: /Đang trong thời gian tạm nghỉ/ })).toBeVisible();
  await expect(dialog).toHaveCount(0);

  // Closing an open position is still allowed.
  await closeOne(0);
  await expect(page.getByText('Đã đóng vị thế.')).toBeVisible();
  await expect(banner).toBeVisible();

  // Turning the rule off re-enables ordering.
  await page.getByText('Giả định phí, trượt giá, ký quỹ (bấm để chỉnh)').click();
  const sw = page.locator('#pt-cooloff');
  await expect(sw).toBeChecked();
  await sw.uncheck();
  await expect(sw).not.toBeChecked();
  await expect(banner).toHaveCount(0);
  await review.click();
  await expect(dialog).toBeVisible();
});

// ---- 2. mistake tags ----------------------------------------------------------------------------------------

test('mistake tags: tag a losing trade, persists after reload, counted in "Lỗi hay gặp tháng này"', async ({ page }) => {
  await open(page, { [PAPER_KEY]: seededState([{ id: 'trd_loss', pnlVnd: -1_500_000, minutesAgo: 5 }]) });
  await openPaper(page);

  // Wait for the lazy paper-trading chunk and the seeded trade before locating the card.
  await expect(page.getByRole('heading', { name: 'Lệnh đã đóng' })).toBeVisible({ timeout: 30_000 });
  const tradesCard = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Lệnh đã đóng' }) }).last();
  await expect(tradesCard.getByText('Lệnh lỗ — tự xem lại: đã mắc lỗi gì?')).toBeVisible();
  await tradesCard.getByRole('button', { name: 'Gắn lỗi' }).click();

  const editor = page.getByRole('group', { name: /Lệnh này mắc lỗi gì/ });
  const tag = editor.getByRole('button', { name: 'Dời cắt lỗ' });
  await tag.click();
  await expect(tag).toHaveAttribute('aria-pressed', 'true');
  await editor.getByPlaceholder('Ghi chú ngắn (không bắt buộc)').fill('Kéo stop xuống khi giá giảm');
  await editor.getByRole('button', { name: 'Lưu lỗi' }).click();
  await expect(editor).toHaveCount(0);

  const chips = tradesCard.getByRole('list', { name: 'Lỗi đã gắn' });
  await expect(chips).toContainText('Dời cắt lỗ');
  await expect(tradesCard.getByText('Kéo stop xuống khi giá giảm')).toBeVisible();
  await expect(tradesCard.getByRole('button', { name: 'Sửa lỗi' })).toBeVisible();

  // Persisted in local storage and shown again after a reload.
  await expect.poll(() => page.evaluate((k) => window.localStorage.getItem(k) ?? '', PAPER_KEY)).toContain('movedStop');
  await page.reload();
  await expect(page.locator('main').first()).toBeVisible();
  await openPaper(page);
  await expect(page.getByRole('list', { name: 'Lỗi đã gắn' })).toContainText('Dời cắt lỗ');
  await expect(page.getByText('Kéo stop xuống khi giá giảm')).toBeVisible();

  // Monthly mistake stats on the "Thống kê" tab.
  await page.getByRole('tab', { name: /Thống kê/ }).first().click();
  const stats = page.getByRole('region', { name: 'Lỗi hay gặp tháng này' });
  await expect(stats).toBeVisible();
  await expect(stats).toContainText('1/1 lệnh đã gắn lỗi');
  const top = stats.getByRole('listitem').filter({ hasText: 'Dời cắt lỗ' });
  await expect(top).toContainText('1. Dời cắt lỗ');
  await expect(top).toContainText('1 lần');
});

// ---- 3. weekly review ---------------------------------------------------------------------------------------

// Chronological L, W, L, W: 4 trades, 50% win rate, no 3-loss streak (no cool-off).
const WEEK_TRADES = [
  { id: 'trd_1', pnlVnd: -1_000_000, minutesAgo: 40 },
  { id: 'trd_2', pnlVnd: 2_000_000, minutesAgo: 30 },
  { id: 'trd_3', pnlVnd: -500_000, minutesAgo: 20 },
  { id: 'trd_4', pnlVnd: 1_500_000, minutesAgo: 10 },
];

async function openWeekly(page: Page) {
  await open(page, { [PAPER_KEY]: seededState(WEEK_TRADES) });
  await openPaper(page, /Thống kê/);
  const card = page.getByRole('region', { name: /Tổng kết tuần tự động/ });
  await expect(card).toBeVisible();
  return card;
}

async function expectFormula(card: ReturnType<Page['getByRole']>) {
  await expect(card.getByText('Số lệnh', { exact: true }).locator('..')).toContainText('4');
  await expect(card.getByText('Tỷ lệ thắng', { exact: true }).locator('..')).toContainText('50%');
  await expect(card.getByText('4 lệnh, tỷ lệ thắng 50%.', { exact: false })).toBeVisible();
  await expect(card.getByText('Tập trung tuần tới')).toBeVisible();
}

test('weekly review: formula text stays when the AI endpoint returns 503', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/paper/weekly-review', (route) => {
    calls++;
    return route.fulfill({ status: 503, json: { error: 'AI_UNAVAILABLE' } });
  });
  const answered = page.waitForResponse((r) => r.url().includes('/api/paper/weekly-review') && r.status() === 503);
  const card = await openWeekly(page);
  await answered;
  await expectFormula(card);
  await expect(card.getByText(/Nhận xét AI/)).toHaveCount(0);
  await expect(card.getByRole('alert')).toHaveCount(0);
  expect(calls).toBeGreaterThan(0);
});

test('weekly review: AI narrative renders when the endpoint returns one', async ({ page }) => {
  await page.route('**/api/paper/weekly-review', (route) => {
    const body = route.request().postDataJSON() as { summary?: { trades?: number; wins?: number } };
    expect(body.summary).toMatchObject({ trades: 4, wins: 2 });
    return route.fulfill({ json: { narrative: 'X', source: 'AI' } });
  });
  const card = await openWeekly(page);
  await expectFormula(card);
  await expect(card.getByText(/Nhận xét AI/)).toBeVisible();
  await expect(card.getByText('X', { exact: true })).toBeVisible();
});

// ---- 4. event-risk banner -----------------------------------------------------------------------------------

test('event risk: gold banner lists the EIA weekly petroleum report before Wednesday 10:30 New York', async ({ page }) => {
  const crude = await crudeInstrument(page);
  test.skip(!crude, 'no enabled CL/BRN instrument with a verified USD spec in /api/instruments');
  if (!crude) return;

  // Wed 2026-12-09 08:30 EST (UTC-5) = 13:30Z, two hours before the EIA release; no federal holiday that week.
  await page.clock.setFixedTime(new Date('2026-12-09T13:30:00Z'));
  await mockMarket(page, crude.exchangeSymbol, 70);
  await open(page);
  await openPaper(page);
  await page.getByRole('button', { name: 'Tạo phiên mới' }).click();
  const banner = page.getByRole('note', { name: 'Cảnh báo báo cáo sắp công bố' });
  await page.locator('#pt-inst').selectOption(crude.id);

  await expect(banner).toBeVisible();
  await expect(banner).toHaveClass(/--warning/);
  await expect(banner).toContainText('Sắp có báo cáo lớn trong 24 giờ tới');
  const eia = banner.getByRole('listitem').filter({ hasText: 'Tồn kho dầu thô EIA (hằng tuần)' });
  await expect(eia).toHaveCount(1);
  // 10:30 ET = 22:30 Vietnam time, about 2 hours from now.
  await expect(eia).toContainText('22:30 09/12 giờ VN');
  await expect(eia).toContainText(/còn khoảng 2[.,]0 giờ/);
  await expect(eia).toContainText('theo lịch tuần cố định');
});
