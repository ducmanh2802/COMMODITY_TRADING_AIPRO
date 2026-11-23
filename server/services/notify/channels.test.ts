import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { WatchZone } from '../../../src/shared/watchlist/watchlist.ts';
import { registerNotifyRoutes } from '../../routes/notify.ts';
import { buildSchedulerJobs } from '../../scheduler/jobs.ts';
import { ChannelStore, MAX_EMAILS_PER_DAY, isValidEmail, maskEmail, type PushSubscriptionJson } from './channelStore.ts';
import { runChannelZoneCheck } from './channelJobs.ts';
import { getSmtp, getVapid, type Channels, type EmailSender, type PushResult, type PushSender } from './channels.ts';

const zone: WatchZone = { kind: 'level', level: 100, direction: 'up' };
const sub = (n: number): PushSubscriptionJson => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'p', auth: 'a' } });

class FakePush implements PushSender {
  sent: Array<{ endpoint: string; body: string }> = [];
  result: PushResult = 'ok';
  async send(s: PushSubscriptionJson, p: { title: string; body: string }) {
    this.sent.push({ endpoint: s.endpoint, body: p.body });
    return this.result;
  }
}
class FakeEmail implements EmailSender {
  sent: Array<{ to: string; subject: string; text: string }> = [];
  async send(m: { to: string; subject: string; text: string }) {
    this.sent.push(m);
    return true;
  }
}

test('disabled without env', () => {
  assert.equal(getVapid({}), null);
  assert.equal(getVapid({ VAPID_PUBLIC_KEY: 'x' }), null);
  assert.equal(getSmtp({}), null);
  assert.equal(getSmtp({ SMTP_HOST: 'h', SMTP_FROM: 'f' }), null); // APP_BASE_URL missing
  assert.notEqual(getSmtp({ SMTP_HOST: 'h', SMTP_FROM: 'f', APP_BASE_URL: 'https://a.example/' }), null);
  assert.equal(buildSchedulerJobs({ env: {} }).some((j) => j.id.startsWith('channel')), false);
  assert.equal(buildSchedulerJobs({ env: {}, channelZones: async () => 0 }).some((j) => j.id === 'channel-zones'), true);
});

test('email validation and masking', () => {
  assert.ok(isValidEmail('a.b+c@example.com'));
  for (const bad of ['', 'x', 'a@b', 'a b@c.com', '@c.com', 'a@@c.com', 5, null]) assert.equal(isValidEmail(bad), false);
  assert.equal(maskEmail('alice@example.com'), 'a***@e***.com');
  assert.ok(!maskEmail('alice@example.com').includes('alice'));
});

test('push store: upsert keeps zone state, remove', () => {
  const st = new ChannelStore(':memory:');
  assert.ok(st.upsertPush(sub(1), false, [{ symbol: 'ZC=F', zone }], 0));
  st.setPushZoneState('https://push.example/1', 'ZC=F', true);
  st.upsertPush(sub(1), true, [{ symbol: 'ZC=F', zone }], 1); // same zone -> state kept
  assert.equal(st.listPushZones('https://push.example/1')[0].inZone, true);
  assert.equal(st.pushCount(), 1);
  assert.equal(st.listPush()[0].radar, true);
  st.removePush('https://push.example/1');
  assert.equal(st.pushCount(), 0);
  assert.equal(st.listPushZones('https://push.example/1').length, 0);
});

test('push job: hysteresis (baseline silent, one alert per entry) and 410 cleanup', async () => {
  const st = new ChannelStore(':memory:');
  st.upsertPush(sub(1), false, [{ symbol: 'ZC=F', zone }], 0);
  const push = new FakePush();
  let price = 50;
  const deps = { store: st, push, email: null, baseUrl: null, getPrice: async () => price };
  assert.equal(await runChannelZoneCheck(deps), 0); // baseline outside
  price = 120;
  assert.equal(await runChannelZoneCheck(deps), 1); // entered
  assert.match(push.sent[0].body, /không phải khuyến nghị/);
  assert.equal(await runChannelZoneCheck(deps), 0); // still inside, no repeat
  price = 50;
  await runChannelZoneCheck(deps); // left
  price = 120;
  assert.equal(await runChannelZoneCheck(deps), 1); // re-entered
  // expired subscription is removed
  push.result = 'gone';
  price = 50;
  await runChannelZoneCheck(deps);
  price = 120;
  await runChannelZoneCheck(deps);
  assert.equal(st.pushCount(), 0);
});

test('push error keeps state so next run retries', async () => {
  const st = new ChannelStore(':memory:');
  st.upsertPush(sub(2), false, [{ symbol: 'ZC=F', zone }], 0);
  const push = new FakePush();
  let price = 50;
  const deps = { store: st, push, email: null, baseUrl: null, getPrice: async () => price };
  await runChannelZoneCheck(deps);
  price = 120;
  push.result = 'error';
  assert.equal(await runChannelZoneCheck(deps), 0);
  push.result = 'ok';
  assert.equal(await runChannelZoneCheck(deps), 1);
});

test('email: double opt-in token flow, resend gap, unsubscribe', () => {
  const st = new ChannelStore(':memory:');
  const a = st.beginEmail('u@example.com', [{ symbol: 'ZC=F', zone }], 0);
  assert.ok(a);
  assert.equal(st.listConfirmedEmails().length, 0); // not confirmed yet
  assert.equal(st.beginEmail('u@example.com', [], 1000), null); // resend gap
  assert.equal(st.confirmEmail('nope', 0), null);
  assert.equal(st.confirmEmail('0'.repeat(48), 0), null);
  assert.equal(st.confirmEmail(a.confirmToken, 5), 'u@example.com');
  assert.equal(st.listConfirmedEmails().length, 1);
  assert.equal(st.beginEmail('u@example.com', [], 99_999_999), null); // already confirmed
  const unsub = st.unsubTokenFor('u@example.com');
  assert.ok(unsub);
  assert.equal(st.unsubscribeEmail('bad'), false);
  assert.equal(st.unsubscribeEmail(unsub), true);
  assert.equal(st.listConfirmedEmails().length, 0);
});

test('email: expired confirm token rejected', () => {
  const st = new ChannelStore(':memory:');
  const a = st.beginEmail('u@example.com', [], 0);
  assert.ok(a);
  assert.equal(st.confirmEmail(a.confirmToken, 49 * 3600_000), null);
});

test('email job: unsubscribe link, one mail per event, daily cap of 20', async () => {
  const st = new ChannelStore(':memory:');
  const a = st.beginEmail('u@example.com', [{ symbol: 'ZC=F', zone }], 0);
  assert.ok(a);
  st.confirmEmail(a.confirmToken, 1);
  const email = new FakeEmail();
  let price = 50;
  const deps = { store: st, push: null, email, baseUrl: 'https://app.example', getPrice: async () => price, now: () => 10_000 };
  await runChannelZoneCheck(deps);
  price = 120;
  assert.equal(await runChannelZoneCheck(deps), 1);
  assert.equal(email.sent.length, 1);
  assert.match(email.sent[0].text, /https:\/\/app\.example\/api\/notify\/email\/unsubscribe\?token=[0-9a-f]{48}/);
  assert.equal(await runChannelZoneCheck(deps), 0); // no repeat while inside
  // daily cap
  const st2 = new ChannelStore(':memory:');
  for (let i = 0; i < MAX_EMAILS_PER_DAY; i++) assert.ok(st2.reserveEmail('x@example.com', 1000));
  assert.equal(st2.reserveEmail('x@example.com', 2000), false);
  assert.ok(st2.reserveEmail('x@example.com', 2000 + 86400_000)); // next UTC day
  assert.ok(st2.reserveEmail('y@example.com', 2000)); // other address independent
});

test('routes: 503 when unconfigured; subscribe/confirm/unsubscribe when configured', async () => {
  const off = express();
  off.use(express.json());
  registerNotifyRoutes(off, { env: {}, service: null });
  const offSrv = off.listen(0);
  const offBase = `http://127.0.0.1:${(offSrv.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${offBase}/api/notify/push/key`)).status, 503);
    const r = await fetch(`${offBase}/api/notify/push/subscribe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 503);
    assert.equal(((await (await fetch(`${offBase}/api/notify/email/status`)).json()) as { configured: boolean }).configured, false);
    assert.equal((await fetch(`${offBase}/api/notify/email/confirm?token=x`)).status, 503);
  } finally {
    offSrv.close();
  }

  const st = new ChannelStore(':memory:');
  const mail = new FakeEmail();
  const channels: Channels = { store: st, vapidPublicKey: 'PUB', push: new FakePush(), email: mail, baseUrl: 'https://app.example' };
  const app = express();
  app.use(express.json());
  registerNotifyRoutes(app, { env: {}, service: null, channels });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.deepEqual(await (await fetch(`${base}/api/notify/push/key`)).json(), { publicKey: 'PUB' });
    assert.equal((await fetch(`${base}/api/notify/push/subscribe`, json({ subscription: { endpoint: 'http://insecure' } }))).status, 400);
    const okSub = await fetch(`${base}/api/notify/push/subscribe`, json({ subscription: sub(7), zones: [{ instrumentId: 'ZC=F', zone }] }));
    assert.equal(okSub.status, 200);
    assert.equal(st.pushCount(), 1);
    await fetch(`${base}/api/notify/push/unsubscribe`, json({ endpoint: sub(7).endpoint }));
    assert.equal(st.pushCount(), 0);

    assert.equal((await fetch(`${base}/api/notify/email/subscribe`, json({ email: 'bad' }))).status, 400);
    assert.equal((await fetch(`${base}/api/notify/email/subscribe`, json({ email: 'User@Example.com' }))).status, 200);
    assert.equal(mail.sent.length, 1);
    assert.equal(mail.sent[0].to, 'user@example.com');
    const token = /token=([0-9a-f]{48})/.exec(mail.sent[0].text)?.[1];
    assert.ok(token);
    assert.equal((await fetch(`${base}/api/notify/email/confirm?token=${'0'.repeat(48)}`)).status, 400);
    assert.equal((await fetch(`${base}/api/notify/email/confirm?token=${token}`)).status, 200);
    assert.equal(st.listConfirmedEmails().length, 1);
    const unsub = st.unsubTokenFor('user@example.com');
    assert.equal((await fetch(`${base}/api/notify/email/unsubscribe?token=${unsub}`)).status, 200);
    assert.equal(st.listConfirmedEmails().length, 0);
  } finally {
    srv.close();
  }
});
