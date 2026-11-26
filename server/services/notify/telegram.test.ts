import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegramClient } from './telegram.ts';

function capture(): { fetchImpl: typeof fetch; bodies: Array<{ text: string; chat_id: string }> } {
  const bodies: Array<{ text: string; chat_id: string }> = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, bodies };
}

const client = (fetchImpl: typeof fetch): TelegramClient =>
  new TelegramClient({ token: 't', fetchImpl, sleep: async () => {}, now: () => 0 });

test('sendMessage: HTML-escaped payload stays within the Telegram 4096-char limit', async () => {
  const { fetchImpl, bodies } = capture();
  // "&" expands to "&amp;" (5x): clamping before escaping would send ~20000 chars and Telegram rejects it
  const r = await client(fetchImpl).sendMessage('123', '&'.repeat(5000));
  assert.deepEqual(r, { ok: true });
  assert.ok(bodies[0].text.length <= 4096, `escaped text length ${bodies[0].text.length}`);
});

test('sendMessage: truncation never cuts an HTML entity in half', async () => {
  const { fetchImpl, bodies } = capture();
  await client(fetchImpl).sendMessage('123', '<'.repeat(5000));
  const stripped = bodies[0].text.replace(/&lt;/g, '').replace(/…$/, '');
  assert.equal(stripped, '', `dangling fragment: ${stripped.slice(0, 10)}`);
});

test('sendMessage: short text passes through unchanged apart from escaping', async () => {
  const { fetchImpl, bodies } = capture();
  await client(fetchImpl).sendMessage('123', 'a<b>&c');
  assert.equal(bodies[0].text, 'a&lt;b&gt;&amp;c');
});
