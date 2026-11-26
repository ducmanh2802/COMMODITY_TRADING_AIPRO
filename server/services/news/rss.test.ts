import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRss } from './rss.ts';

const item = (inner: string): string => `<item>${inner}</item>`;
const wrap = (...items: string[]): string => `<?xml version="1.0"?><rss><channel>${items.join('')}</channel></rss>`;
const DATE = '<pubDate>Tue, 17 Nov 2026 13:30:00 GMT</pubDate>';

test('parseRss: parses a normal item, ISO-normalises the date, decodes entities and CDATA', () => {
  const xml = wrap(
    item(
      `<title><![CDATA[Corn &amp; soy rally]]></title><link>https://example.com/a?x=1&amp;y=2</link>` +
        `${DATE}<source url="https://s">Reuters</source>` +
        `<description>&lt;p&gt;Prices &lt;b&gt;rose&lt;/b&gt; on supply worries&lt;/p&gt;</description>`
    )
  );
  const [it, ...rest] = parseRss(xml, 'fallback');
  assert.equal(rest.length, 0);
  assert.equal(it.title, 'Corn & soy rally');
  assert.equal(it.link, 'https://example.com/a?x=1&y=2');
  assert.equal(it.publishedAt, '2026-11-17T13:30:00.000Z');
  assert.equal(it.source, 'Reuters');
  assert.equal(it.snippet, 'Prices rose on supply worries');
});

test('parseRss: converts non-UTC offsets and falls back for missing source', () => {
  const xml = wrap(item(`<title>T</title><link>http://x.test/1</link><pubDate>Tue, 17 Nov 2026 20:00:00 +0700</pubDate>`));
  const [it] = parseRss(xml, 'Fallback Src');
  assert.equal(it.publishedAt, '2026-11-17T13:00:00.000Z');
  assert.equal(it.source, 'Fallback Src');
  assert.equal(it.snippet, '');
});

test('parseRss: drops items with missing title, non-http link or bad/missing date', () => {
  const xml = wrap(
    item(`<link>https://x.test/1</link>${DATE}`),
    item(`<title>No link</title>${DATE}`),
    item(`<title>JS link</title><link>javascript:alert(1)</link>${DATE}`),
    item(`<title>Bad date</title><link>https://x.test/2</link><pubDate>not a date</pubDate>`),
    item(`<title>No date</title><link>https://x.test/3</link>`),
    item(`<title>   </title><link>https://x.test/4</link>${DATE}`),
    item(`<title>Good</title><link>https://x.test/ok</link>${DATE}`)
  );
  assert.deepEqual(parseRss(xml).map((i) => i.title), ['Good']);
});

test('parseRss: empty, malformed and non-RSS payloads yield []', () => {
  assert.deepEqual(parseRss(''), []);
  assert.deepEqual(parseRss('<html><body>502 Bad Gateway</body></html>'), []);
  assert.deepEqual(parseRss(`<rss><channel><item><title>x</title><link>https://a.test</link>${DATE}`), [], 'unterminated item');
  assert.deepEqual(parseRss('{"json": true}'), []);
});

test('parseRss: snippet duplicating the title is dropped, long snippets are cut to 400 chars', () => {
  const dup = wrap(item(`<title>Same text</title><link>https://x.test/1</link>${DATE}<description>Same text - more</description>`));
  assert.equal(parseRss(dup)[0].snippet, '');
  const long = wrap(item(`<title>T</title><link>https://x.test/1</link>${DATE}<description>${'a'.repeat(1000)}</description>`));
  assert.equal(parseRss(long)[0].snippet.length, 400);
});

test('parseRss: tags with attributes and uppercase names, multiple items keep order', () => {
  const xml = wrap(
    item(`<TITLE lang="en">First</TITLE><LINK>https://x.test/1</LINK>${DATE}`),
    item(`<title>Second</title><link>https://x.test/2</link><pubDate>Mon, 16 Nov 2026 13:30:00 GMT</pubDate>`)
  );
  assert.deepEqual(parseRss(xml).map((i) => i.title), ['First', 'Second']);
});
