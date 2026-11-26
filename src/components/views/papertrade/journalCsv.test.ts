import test from 'node:test';
import assert from 'node:assert/strict';
import { CSV_BOM, buildJournalCsv, csvEscape, type CsvTrade } from './journalCsv';

const base: CsvTrade = { openedAtMs: Date.UTC(2026, 0, 2), closedAtMs: Date.UTC(2026, 0, 3), instrumentName: 'Cà phê', side: 'LONG', contracts: 2, entryPrice: 100, exitPrice: 110, stopLoss: 90, pnlVnd: 1234.4, rMultiple: 1.234 };

test('starts with BOM and header, CRLF rows', () => {
  const csv = buildJournalCsv([base]);
  assert.ok(csv.startsWith(CSV_BOM + 'Ngày mở,'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1], '2026-01-02,2026-01-03,Cà phê,LONG,2,100,110,90,1234,1.23,,');
});

test('escapes commas, quotes, newlines; blocks formula injection', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('x\ny'), '"x\ny"');
  assert.equal(csvEscape('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvEscape(-5), '-5');
});

test('R blank when stop unknown; tags and note quoted; sorted by close', () => {
  const a: CsvTrade = { ...base, closedAtMs: Date.UTC(2026, 0, 9), stopLoss: null, tags: ['FOMO', 'sớm'], note: 'ok, "tốt"' };
  const b: CsvTrade = { ...base, closedAtMs: Date.UTC(2026, 0, 5) };
  const lines = buildJournalCsv([a, b]).trim().split('\r\n');
  assert.ok(lines[1].includes('2026-01-05'));
  assert.ok(lines[2].endsWith(',110,,1234,,FOMO; sớm,"ok, ""tốt"""'));
});

test('empty list gives header only', () => {
  assert.equal(buildJournalCsv([]).trim().split('\r\n').length, 1);
});
