import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { evaluateZone, type WatchZone } from '../../../src/shared/watchlist/watchlist.ts';
import { registerNotifyRoutes, type NotifyService } from '../../routes/notify.ts';
import { buildSchedulerJobs } from '../../scheduler/jobs.ts';
import { runRadarCheck, runZoneCheck, zoneMessage } from './jobs.ts';
import { handleUpdate, MSG_BAD_CODE, MSG_LINKED } from './poller.ts';
import { NotifyStore } from './store.ts';
import { ChatRateLimiter, TelegramClient, clampText, escapeHtml, getBotToken, isValidChatId, type Messenger } from './telegram.ts';

class FakeMessenger implements Messenger {
  sent: Array<{ chatId: string; text: string }> = [];
  async sendMessage(chatId: string, text: string) {
    this.sent.push({ chatId, text });
    return { ok: true as const };
  }
}

test('escaping, clamping, chat id validation', () => {
  assert.equal(escapeHtml('<b>a&b</b>'), '&lt;b&gt;a&amp;b&lt;/b&gt;');
  assert.ok(clampText('x'.repeat(10_000)).length <= 4000);
  assert.equal(clampText('abc'), 'abc');
  assert.ok(isValidChatId('123456789'));
  for (const bad of ['', '-100123', 'abc', '12 3', '1'.repeat(30), 5, null]) assert.equal(isValidChatId(bad), false);
});

test('disabled without token', () => {
  assert.equal(getBotToken({}), null);
  assert.equal(getBotToken({ TELEGRAM_BOT_TOKEN: '  ' }), null);
  const jobs = buildSchedulerJobs({ env: {} });
  assert.equal(jobs.some((j) => j.id.startsWith('telegram')), false);
});

test('rate limiter: 1/s spacing and 20/min cap per chat', () => {
  const l = new ChatRateLimiter();
  assert.equal(l.reserve('1', 0), 0);
  assert.equal(l.reserve('1', 0), 1000);
  assert.equal(l.reserve('1', 100), 1900);
  assert.equal(l.reserve('2', 0), 0); // other chat independent
  const l2 = new ChatRateLimiter();
  let t = 0;
  for (let i = 0; i < 20; i++) {
    assert.notEqual(l2.reserve('9', t), null);
    t += 1000;
  }
  assert.equal(l2.reserve('9', t), null);
  assert.notEqual(l2.reserve('9', t + 70_000), null);
});

test('sendMessage retries on 429 honouring retry_after, escapes, never leaks token', async () => {
  const calls: Array<{ url: string; body: { text: string } }> = [];
  const sleeps: number[] = [];
  let n = 0;
  const fetchImpl = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    n++;
    if (n === 1) return new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 3 } }), { status: 429 });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as unknown as typeof fetch;
  const c = new TelegramClient({ token: 'SECRET:TOKEN', fetchImpl, sleep: async (ms) => void sleeps.push(ms), now: () => 0 });
  const r = await c.sendMessage('42', '<x> & y');
  assert.deepEqual(r, { ok: true });
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [3000]);
  assert.equal(calls[0].body.text, '&lt;x&gt; &amp; y');
  assert.deepEqual(await c.sendMessage('-5', 'x'), { ok: false, reason: 'invalid_chat' });
  assert.equal(calls.length, 2);
  const failing = new TelegramClient({
    token: 'SECRET:TOKEN',
    fetchImpl: (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch,
    sleep: async () => {},
  });
  const fr = await failing.sendMessage('42', 'x');
  assert.equal(JSON.stringify(fr).includes('SECRET'), false);
  assert.deepEqual(fr, { ok: false, reason: 'network' });
});

test('link-code flow via bot /start', async () => {
  const store = new NotifyStore(':memory:');
  const m = new FakeMessenger();
  const code = store.createPending(1000)!;
  assert.equal(store.chatIdFor(code), null); // pending is not linked
  assert.equal(await handleUpdate({ update_id: 1, message: { text: '/start WRONGCODE2', chat: { id: 7, type: 'private' } } }, store, m, 2000), true);
  assert.equal(m.sent.at(-1)?.text, MSG_BAD_CODE);
  assert.equal(await handleUpdate({ update_id: 2, message: { text: `/start ${code}`, chat: { id: 7, type: 'group' } } }, store, m, 2000), false);
  await handleUpdate({ update_id: 3, message: { text: `/start ${code}`, chat: { id: 7, type: 'private' } } }, store, m, 2000);
  assert.equal(m.sent.at(-1)?.text, MSG_LINKED);
  assert.equal(store.chatIdFor(code), '7');
  await handleUpdate({ update_id: 4, message: { text: `/start ${code}`, chat: { id: 8, type: 'private' } } }, store, m, 3000);
  assert.equal(m.sent.at(-1)?.text, MSG_BAD_CODE); // code is single use
  const expired = store.createPending(0)!;
  assert.equal(store.claim(expired, '9', 61 * 60_000 + 1), false);
  await handleUpdate({ update_id: 5, message: { text: '/stop', chat: { id: 7, type: 'private' } } }, store, m, 4000);
  assert.equal(store.chatIdFor(code), null);
});

const RANGE: WatchZone = { kind: 'range', low: 100, high: 110 };

test('zone job uses shared evaluateZone (baseline silent, enter alerts once, hysteresis)', async () => {
  const store = new NotifyStore(':memory:');
  store.claim(store.createPending(0)!, '5', 0);
  store.setSync('5', { enabled: true, radar: false }, [{ symbol: 'RC', zone: RANGE }]);
  const m = new FakeMessenger();
  let price = 150;
  const deps = { store, messenger: m, getPrice: async () => price };
  assert.equal(await runZoneCheck(deps), 0); // baseline outside
  price = 105;
  assert.equal(await runZoneCheck(deps), 1);
  assert.equal(await runZoneCheck(deps), 0); // still inside, no repeat
  price = 110.1; // within hysteresis of the edge: not "left"
  assert.equal(await runZoneCheck(deps), 0);
  assert.equal(evaluateZone(true, 110.1, RANGE).left, false);
  price = 150;
  await runZoneCheck(deps); // left
  price = 101;
  assert.equal(await runZoneCheck(deps), 1);
  const text = m.sent[0].text;
  assert.equal(text, zoneMessage('RC', RANGE));
  assert.match(text, /không phải giá thời gian thực/);
  assert.match(text, /không phải khuyến nghị/);
});

test('zone job skips disabled chats and unknown prices', async () => {
  const store = new NotifyStore(':memory:');
  store.claim(store.createPending(0)!, '5', 0);
  store.setSync('5', { enabled: false, radar: false }, [{ symbol: 'RC', zone: RANGE }]);
  const m = new FakeMessenger();
  assert.equal(await runZoneCheck({ store, messenger: m, getPrice: async () => 105 }), 0);
  store.setSync('5', { enabled: true, radar: false }, [{ symbol: 'RC', zone: RANGE }]);
  assert.equal(await runZoneCheck({ store, messenger: m, getPrice: async () => null }), 0);
  assert.equal(m.sent.length, 0);
});

test('radar job: baseline then new top entry', async () => {
  const store = new NotifyStore(':memory:');
  store.claim(store.createPending(0)!, '5', 0);
  store.setSync('5', { enabled: false, radar: true }, []);
  const m = new FakeMessenger();
  const item = (id: string, score: number) => ({ id, symbol: id, name: id, score, breakouts: [], reasons: [], asOf: '2026-01-01' });
  let items = [item('A', 60)];
  const getRadar = async () => ({ items }) as never;
  assert.equal(await runRadarCheck({ store, messenger: m, getRadar }), 0);
  items = [item('A', 60), item('B', 70)];
  assert.equal(await runRadarCheck({ store, messenger: m, getRadar }), 1);
  assert.equal(await runRadarCheck({ store, messenger: m, getRadar }), 0);
});

async function withApp<T>(service: NotifyService | null, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  registerNotifyRoutes(app, { env: {}, service });
  const srv = app.listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  try {
    return await fn(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`);
  } finally {
    srv.close();
  }
}
const post = (base: string, path: string, body: unknown) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('routes: off without token', async () => {
  await withApp(null, async (base) => {
    const st = (await (await fetch(`${base}/api/notify/telegram/status`)).json()) as { configured: boolean };
    assert.equal(st.configured, false);
    assert.equal((await post(base, '/api/notify/telegram/test', { linkCode: 'ABCDEFGHJK' })).status, 503);
    assert.equal((await post(base, '/api/notify/watchlist', { items: [] })).status, 503);
  });
});

test('routes: only linked chats can be messaged; sync validated', async () => {
  const store = new NotifyStore(':memory:');
  const m = new FakeMessenger();
  const svc: NotifyService = { store, messenger: m, botUsername: async () => 'bot' };
  await withApp(svc, async (base) => {
    assert.equal((await post(base, '/api/notify/telegram/test', { chatId: '123', linkCode: 'ABCDEFGHJK' })).status, 403);
    assert.equal((await post(base, '/api/notify/telegram/alert', { chatId: '123', text: 'spam' })).status, 403);
    const { linkCode } = (await (await post(base, '/api/notify/telegram/link-code', {})).json()) as { linkCode: string };
    assert.equal((await post(base, '/api/notify/telegram/test', { linkCode })).status, 403); // pending only
    store.claim(linkCode, '123', Date.now());
    assert.equal((await post(base, '/api/notify/telegram/test', { linkCode, chatId: '999' })).status, 403); // mismatch
    assert.equal((await post(base, '/api/notify/telegram/test', { linkCode })).status, 200);
    assert.equal((await post(base, '/api/notify/telegram/alert', { linkCode, text: 'x'.repeat(501) })).status, 400);
    assert.equal((await post(base, '/api/notify/telegram/alert', { linkCode, text: 'hi' })).status, 200);
    assert.ok(m.sent.every((s) => s.chatId === '123'));
    assert.equal((await post(base, '/api/notify/watchlist', { linkCode, items: Array(61).fill({}) })).status, 400);
    assert.equal((await post(base, '/api/notify/watchlist', { linkCode, items: [{ instrumentId: 'bad sym!', zone: RANGE }] })).status, 400);
    const ok = await post(base, '/api/notify/watchlist', { linkCode, enabled: true, items: [{ instrumentId: 'RC', zone: RANGE }, { instrumentId: 'KC', zone: null }] });
    assert.deepEqual(await ok.json(), { ok: true, synced: 1 });
    assert.equal(store.listZones('123').length, 1);
    const st = (await (await fetch(`${base}/api/notify/telegram/status`, { headers: { 'x-link-code': linkCode } })).json()) as { linked: boolean; enabled: boolean };
    assert.equal(st.linked, true);
    assert.equal(st.enabled, true);
  });
});
