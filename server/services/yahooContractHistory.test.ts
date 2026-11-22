import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYahooContractSymbol, chooseChartSeries, getContractD1 } from './yahooContractHistory.ts';
import { instrumentRepository } from './instrumentRegistry.ts';

test('buildYahooContractSymbol builds ROOT+code+YY.EXCH', () => {
  assert.equal(buildYahooContractSymbol('ZC', '2026-12', 'CBT'), 'ZCZ26.CBT');
  assert.equal(buildYahooContractSymbol('ZC', '2027-03', 'CBT'), 'ZCH27.CBT');
  assert.equal(buildYahooContractSymbol('KC', '2027-03', 'NYB'), 'KCH27.NYB');
});

test('buildYahooContractSymbol rejects malformed input', () => {
  assert.equal(buildYahooContractSymbol('ZC', '2026-13', 'CBT'), null);
  assert.equal(buildYahooContractSymbol('ZC', 'Dec-2026', 'CBT'), null);
  assert.equal(buildYahooContractSymbol('', '2026-12', 'CBT'), null);
});

test('getContractD1 is UNAVAILABLE (no month / disabled / HTTP 404 / network error), never real network', async () => {
  const inst = (await instrumentRepository.findBySymbol('ZC'))!;
  let calls = 0;
  const counting = (async () => {
    calls++;
    return new Response('{}');
  }) as typeof fetch;
  const prev = process.env.YAHOO_ENABLED;
  try {
    process.env.YAHOO_ENABLED = 'true';
    assert.equal((await getContractD1(inst, null, { fetchFn: counting })).status, 'UNAVAILABLE');
    process.env.YAHOO_ENABLED = 'false';
    assert.equal((await getContractD1(inst, '2026-12', { fetchFn: counting })).status, 'UNAVAILABLE');
    assert.equal(calls, 0);
    process.env.YAHOO_ENABLED = 'true';
    const nf = await getContractD1(inst, '2026-12', { fetchFn: (async () => new Response('{}', { status: 404 })) as typeof fetch });
    assert.equal(nf.status, 'UNAVAILABLE');
    const boom = await getContractD1(inst, '2026-12', {
      fetchFn: (async () => {
        throw new Error('boom');
      }) as typeof fetch,
    });
    assert.equal(boom.status, 'UNAVAILABLE');
  } finally {
    if (prev === undefined) delete process.env.YAHOO_ENABLED;
    else process.env.YAHOO_ENABLED = prev;
  }
});

test('chooseChartSeries: contract preferred; continuous + roll warning as fallback', () => {
  const cont = [{ c: 1 }];
  const ok = chooseChartSeries(
    { status: 'OK', contractMonth: '2026-12', yahooSymbol: 'ZCZ26.CBT', candles: [{ c: 2 }] as never, source: 's' },
    cont
  );
  assert.equal(ok.series, 'CONTRACT');
  assert.equal(ok.rollWarning, false);
  assert.deepEqual(ok.candles, [{ c: 2 }]);
  const fb = chooseChartSeries({ status: 'UNAVAILABLE', contractMonth: '2026-12', reason: 'x' }, cont);
  assert.equal(fb.series, 'CONTINUOUS');
  assert.equal(fb.rollWarning, true);
  assert.deepEqual(fb.candles, cont);
});
