import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEcbDailyXml, parseEcbHistoricalXml, parseFredFxCsv } from './sources.ts';

const NOW = new Date('2026-11-20T18:00:00Z');

// The live ECB daily file uses single quotes; the historical file uses double quotes. Both must parse.
const DAILY_SINGLE = `<gesmes:Envelope><Cube><Cube time='2026-11-20'><Cube currency='USD' rate='1.0512'/><Cube currency='JPY' rate='168.12'/></Cube></Cube></gesmes:Envelope>`;
const HIST_DOUBLE = `<Cube><Cube time="2026-11-20"><Cube currency="USD" rate="1.0512"/></Cube><Cube time="2026-11-13"><Cube currency="USD" rate="1.0570"/></Cube></Cube>`;

test('ECB daily XML with single quotes parses rate and date', () => {
  const dp = parseEcbDailyXml(DAILY_SINGLE, 'USD', NOW, NOW.toISOString());
  assert.ok(dp);
  assert.equal(dp.value, 1.0512);
  assert.equal(dp.asOf, '2026-11-20');
  assert.equal(dp.sourceQuality, 'OFFICIAL');
  assert.equal(typeof dp.label, 'string');
});

test('ECB daily XML missing the currency fails closed (null, never a default)', () => {
  assert.equal(parseEcbDailyXml(DAILY_SINGLE, 'BRL', NOW, NOW.toISOString()), null);
  assert.equal(parseEcbDailyXml('<html>error</html>', 'USD', NOW, NOW.toISOString()), null);
});

test('ECB historical XML (double quotes) parses a dated series', () => {
  const s = parseEcbHistoricalXml(HIST_DOUBLE, 'USD');
  assert.equal(s.length, 2);
  assert.ok(s.some((p) => p.date === '2026-11-13' && p.value === 1.057));
});

test('FRED CSV skips missing "." observations', () => {
  const s = parseFredFxCsv('observation_date,DEXJPUS\n2026-11-12,159.5\n2026-11-13,.\n2026-11-14,159.93\n');
  assert.deepEqual(
    s.map((p) => p.date),
    ['2026-11-12', '2026-11-14']
  );
});
