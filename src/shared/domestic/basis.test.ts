import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBasis, domesticToVndPerKg, intlToVndPerKg, parseDomesticCsv, validateDomesticEntry } from './basis.ts';

test('robusta USD/t to VND/kg', () => {
  assert.equal(intlToVndPerKg(4000, 'USD/t', 25000), 100000);
});

test('corn and soymeal conversions', () => {
  assert.ok(Math.abs(intlToVndPerKg(450, 'USc/bu', 25000) - (4.5 / 25.4012) * 25000) < 1e-6);
  assert.ok(Math.abs(intlToVndPerKg(300, 'USD/st', 25000) - (300 / 907.18474) * 25000) < 1e-6);
});

test('domestic unit conversion', () => {
  assert.equal(domesticToVndPerKg(95000, 'VND/kg', null), 95000);
  assert.equal(domesticToVndPerKg(300, 'USD/t', 25000), 7500);
  assert.equal(domesticToVndPerKg(300, 'USD/t', null), null);
  assert.equal(domesticToVndPerKg(1, 'x', 1), null);
});

test('basis and pct', () => {
  const b = computeBasis(95000, 100000)!;
  assert.equal(b.basisVndPerKg, -5000);
  assert.equal(b.basisPct, -5);
  assert.equal(computeBasis(1, 0), null);
  assert.equal(computeBasis(NaN, 5), null);
});

test('validate requires source and url', () => {
  const base = { commodity: 'coffee', price: '95,000', unit: 'VND/kg', date: '2026-11-20', source: 'Bao X', sourceUrl: 'https://example.com/a' };
  const ok = validateDomesticEntry(base);
  assert.ok(ok.ok && ok.point.price === 95000 && ok.point.quality === 'MANUAL');
  assert.equal(validateDomesticEntry({ ...base, sourceUrl: '' }).ok, false);
  assert.equal(validateDomesticEntry({ ...base, source: '' }).ok, false);
  assert.equal(validateDomesticEntry({ ...base, date: '20/11/2026' }).ok, false);
  assert.equal(validateDomesticEntry({ ...base, commodity: 'gold' }).ok, false);
});

test('csv parse reports bad lines', () => {
  const csv =
    'commodity,region,price,unit,date,source,sourceUrl,quality\n' +
    'coffee,Dak Lak,94000,VND/kg,2026-11-20,Bao X,https://e.com/a,UNOFFICIAL\n' +
    'pepper,,abc,VND/kg,2026-11-20,B,https://e.com\n';
  const r = parseDomesticCsv(csv);
  assert.equal(r.points.length, 1);
  assert.equal(r.points[0].quality, 'UNOFFICIAL');
  assert.equal(r.errors[0].line, 3);
});
