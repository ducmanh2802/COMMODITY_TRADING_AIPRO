import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerContractRoutes } from './contracts.ts';

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  registerContractRoutes(app, { now: () => new Date('2026-11-17T03:00:00.000Z') });
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('GET /api/contracts/:id/chain returns computed contracts with sources and warnings', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/contracts/CBOT:ZC/chain?asOf=2026-11-17&count=3`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.instrumentId, 'CBOT:ZC');
    assert.equal(body.holidayAdjusted, true);
    assert.deepEqual(body.contracts.map((c: { code: string }) => c.code), ['ZCZ26', 'ZCH27', 'ZCK27']);
    assert.deepEqual(body.contracts.map((c: { mxvCode: string }) => c.mxvCode), ['ZCEZ26', 'ZCEH27', 'ZCEK27']);
    assert.equal(body.contracts[0].lastTradingDay.date, '2026-12-14');
    assert.equal(body.contracts[0].lastTradingDay.holidayAdjusted, true);
    assert.equal(body.contracts[0].lastTradingDay.holidayDataStatus, 'PROJECTED');
    assert.ok(body.contracts[0].lastTradingDay.warnings.length > 0);
    assert.equal(body.contracts[0].firstNoticeDay.status, 'UNAVAILABLE');
    assert.ok(body.sources.includes('https://www.cmegroup.com/rulebook/CBOT/I/10.pdf'));
  });
});

test('chain defaults asOf to today (UTC) and accepts a bare exchange symbol', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/contracts/HG/chain`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.asOf, '2026-11-17');
    assert.equal(body.count, 6);
    assert.equal(body.calendarStatus, 'UNVERIFIED');
    assert.ok(body.contracts.every((c: { calendarStatus: string }) => c.calendarStatus === 'UNVERIFIED'));
  });
});

test('chain validates input and returns 404 for unknown instruments', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/contracts/CBOT:ZC/chain?asOf=2026-13-01`)).status, 400);
    assert.equal((await fetch(`${base}/api/contracts/CBOT:ZC/chain?count=0`)).status, 400);
    assert.equal((await fetch(`${base}/api/contracts/CBOT:ZC/chain?count=abc`)).status, 400);
    assert.equal((await fetch(`${base}/api/contracts/NOPE:XX/chain`)).status, 404);
  });
});
