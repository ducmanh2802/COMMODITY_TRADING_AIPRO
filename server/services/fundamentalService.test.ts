import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApiApp } from '../app.ts';
import { InMemoryCandleRepository } from '../storage/candleRepository.ts';
import { FundamentalStore, fundamentalStore } from './fundamentalService.ts';

test('FundamentalStore notifies subscribers on addRecord, addNews, and clearAll and stops after unsubscribe', () => {
  const store = new FundamentalStore();
  const events: string[] = [];
  const unsubscribe = store.subscribe((ev) => {
    events.push(ev.kind);
  });

  store.addRecord({
    dataset: 'USDA_WASDE_CORN',
    source: 'USDA WASDE',
    publicationTimestamp: '2026-10-12T16:00:00.000Z',
    dataPeriod: '2026/27',
    category: 'USDA_WASDE',
    relatedSymbols: ['zc'],
    actualValue: 312.5,
    previousValue: 315.0,
    forecastValue: 314.0,
    unit: 'MMT',
    revisionStatus: 'FINAL',
    impactAssessment: 'BULLISH',
  });

  const newsItem = store.addNews({
    headline: 'Vietnam Robusta shipments slow ahead of harvest',
    source: 'Reuters',
    publicationTimestamp: '2026-10-13T08:00:00.000Z',
    category: 'EXPORT_IMPORT',
    relatedSymbols: [' rc ', 'KC', 'rc'],
    classification: 'BULLISH',
    summary: 'Verified port loading pace declined week-on-week.',
  });

  assert.deepEqual(newsItem.relatedSymbols, ['RC', 'KC']);
  assert.deepEqual(events, ['RECORD', 'NEWS']);

  store.clearAll();
  assert.deepEqual(events, ['RECORD', 'NEWS', 'CLEAR']);

  unsubscribe();
  store.addNews({
    headline: 'Ignored after unsubscribe',
    source: 'USDA',
    publicationTimestamp: '2026-10-14T08:00:00.000Z',
    category: 'USDA_REPORT',
    relatedSymbols: ['ZC'],
    classification: 'SIDEWAYS',
    summary: 'No changes.',
  });
  assert.deepEqual(events, ['RECORD', 'NEWS', 'CLEAR']);
});

test('FundamentalStore.listNews enforces asOf no-look-ahead and filters by symbol', () => {
  const store = new FundamentalStore();
  store.addNews({
    headline: 'Earlier Robusta news',
    source: 'ICO',
    publicationTimestamp: '2026-10-10T10:00:00.000Z',
    category: 'SUPPLY_DEMAND',
    relatedSymbols: ['RC'],
    classification: 'BULLISH',
    summary: 'Stocks tighten.',
  });
  store.addNews({
    headline: 'Later Crude news',
    source: 'EIA',
    publicationTimestamp: '2026-10-20T10:00:00.000Z',
    category: 'EIA_REPORT',
    relatedSymbols: ['CL'],
    classification: 'BEARISH',
    summary: 'Inventory build.',
  });

  const before = store.listNews({ asOf: '2026-10-15T00:00:00.000Z' });
  assert.equal(before.length, 1);
  assert.equal(before[0].headline, 'Earlier Robusta news');

  const crudeOnly = store.listNews({ symbol: 'cl' });
  assert.equal(crudeOnly.length, 1);
  assert.equal(crudeOnly[0].headline, 'Later Crude news');
});

test('GET /api/fundamental/stream sends snapshot immediately and pushes live update when POST /api/fundamental/records creates NEWS', async () => {
  fundamentalStore.clearAll();
  const app = createApiApp({
    candles: new InMemoryCandleRepository(),
    rateLimit: false,
    adminToken: null,
  });

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const controller = new AbortController();
  try {
    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const badRes = await fetch(`${baseUrl}/api/fundamental/stream?asOf=not-a-date`);
    assert.equal(badRes.status, 400);

    const streamRes = await fetch(`${baseUrl}/api/fundamental/stream`, {
      signal: controller.signal,
    });
    assert.equal(streamRes.status, 200);
    assert.match(streamRes.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.ok(streamRes.body);

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const receivedEvents: Array<{ event: string; data: { status: string; news: Array<{ headline: string }> } }> = [];

    const readNextEvent = async (): Promise<{ event: string; data: { status: string; news: Array<{ headline: string }> } }> => {
      while (true) {
        const sepIdx = buffer.indexOf('\n\n');
        if (sepIdx >= 0) {
          const block = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          if (block.startsWith(':')) continue;
          let eventName = 'message';
          let dataLine = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            if (line.startsWith('data: ')) dataLine += line.slice(6).trim();
          }
          if (dataLine) {
            return { event: eventName, data: JSON.parse(dataLine) };
          }
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error('Stream closed unexpectedly');
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    };

    const snapshot = await readNextEvent();
    receivedEvents.push(snapshot);
    assert.equal(snapshot.event, 'snapshot');
    assert.equal(snapshot.data.status, 'UNAVAILABLE');
    assert.equal(snapshot.data.news.length, 0);

    const postRes = await fetch(`${baseUrl}/api/fundamental/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'NEWS',
        dataset: 'ICE_ROBUSTA_NEWS',
        source: 'Reuters',
        publicationTimestamp: '2026-11-20T09:30:00.000Z',
        impactAssessment: 'BULLISH',
        headline: 'Tight Robusta deliverable stocks lift London futures',
        summary: 'Exchange certified stocks fell to multi-week lows.',
        relatedSymbols: ['RC'],
      }),
    });
    assert.equal(postRes.status, 201);

    const update = await readNextEvent();
    receivedEvents.push(update);
    assert.equal(update.event, 'update');
    assert.equal(update.data.status, 'HISTORICAL');
    assert.equal(update.data.news.length, 1);
    assert.equal(update.data.news[0].headline, 'Tight Robusta deliverable stocks lift London futures');
  } finally {
    controller.abort();
    fundamentalStore.clearAll();
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
