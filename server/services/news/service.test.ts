import test from 'node:test';
import assert from 'node:assert/strict';
import { NewsService } from './service.ts';
import { parseRss } from './rss.ts';

const XML = `<rss><channel>
<item><title>Corn rallies on USDA report - Reuters</title><link>https://example.com/a</link><pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate><source url="x">Reuters</source><description>&lt;a&gt;Corn rallies&lt;/a&gt;</description></item>
<item><title>Gold steady</title><link>https://example.com/b</link><pubDate>Tue, 17 Nov 2026 10:00:00 GMT</pubDate></item>
<item><title>Unrelated sports</title><link>https://example.com/c</link><pubDate>Tue, 17 Nov 2026 11:00:00 GMT</pubDate></item>
<item><title>bad</title><link>javascript:x</link><pubDate>Tue, 17 Nov 2026 11:00:00 GMT</pubDate></item>
</channel></rss>`;

test('parseRss skips invalid links', () => {
  assert.equal(parseRss(XML).length, 3);
});

test('service filters by instrument, dedupes, no summaries without summarizer', async () => {
  const svc = new NewsService({ fetchText: async () => XML });
  const all = await svc.getNews();
  assert.equal(all.aiSummaries, false);
  assert.equal(all.items.length, 2);
  const corn = await svc.getNews({ instrument: 'CBOT:ZC' });
  assert.equal(corn.items.length, 1);
  assert.equal(corn.items[0].impact, 'CAO');
  assert.equal(corn.items[0].summaryVi, null);
});

test('summarizer cached per item; failing feeds yield empty, not error', async () => {
  let calls = 0;
  const svc = new NewsService({
    fetchText: async () => XML,
    summarizer: async () => {
      calls++;
      return 'Tóm tắt';
    },
  });
  await svc.getNews();
  await svc.getNews();
  assert.equal(calls, 2);
  const bad = new NewsService({
    fetchText: async () => {
      throw new Error('x');
    },
  });
  assert.deepEqual((await bad.getNews()).items, []);
});
