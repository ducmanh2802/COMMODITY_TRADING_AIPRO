import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_KEYS, buildBackup, restoreBackup, tradesToCsv, validateBackup, type StorageLike } from './backup';

function mem(init: Record<string, string> = {}): StorageLike & { m: Map<string, string> } {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

const seed = () =>
  mem({
    [BACKUP_KEYS.paper]: JSON.stringify({ sessions: [{ id: 's1' }], positions: [], trades: [{ id: 't1' }] }),
    [BACKUP_KEYS.watchlist]: JSON.stringify([{ id: 'a' }]),
    [BACKUP_KEYS.learnGoal]: 'beginner',
    [BACKUP_KEYS.review]: JSON.stringify({ version: 1, items: [{ id: 'q1' }] }),
  });

test('round trip replace', () => {
  const b = buildBackup(seed(), new Date('2026-01-02T03:04:05Z'));
  assert.equal(b.version, 1);
  assert.equal(b.exportedAt, '2026-01-02T03:04:05.000Z');
  const dst = mem();
  const r = restoreBackup(JSON.parse(JSON.stringify(b)), 'replace', dst);
  assert.equal(r.ok, true);
  assert.equal(dst.getItem(BACKUP_KEYS.learnGoal), 'beginner');
  assert.deepEqual(JSON.parse(dst.getItem(BACKUP_KEYS.paper)!), JSON.parse(seed().getItem(BACKUP_KEYS.paper)!));
  assert.equal(dst.getItem(BACKUP_KEYS.drawings), null);
});

test('merge unions by id and keeps existing', () => {
  const b = buildBackup(seed());
  const dst = mem({ [BACKUP_KEYS.watchlist]: JSON.stringify([{ id: 'b' }, { id: 'a', note: 'keep' }]), [BACKUP_KEYS.learnGoal]: 'pro' });
  restoreBackup(b, 'merge', dst);
  assert.deepEqual(JSON.parse(dst.getItem(BACKUP_KEYS.watchlist)!), [{ id: 'b' }, { id: 'a', note: 'keep' }]);
  assert.equal(dst.getItem(BACKUP_KEYS.learnGoal), 'pro');
});

test('invalid files give errors and write nothing', () => {
  const bads: unknown[] = ['not json', '[]', {}, { version: 1 }, { version: 99, exportedAt: 'x', data: {} }, { version: 1, exportedAt: 'x', data: { paper: [] } }];
  for (const bad of bads) {
    const r = validateBackup(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.error.length > 5);
  }
  const dst = mem();
  assert.equal(restoreBackup('xx', 'replace', dst).ok, false);
  assert.equal(dst.m.size, 0);
});

test('csv has BOM, escapes commas and quotes', () => {
  const csv = tradesToCsv([
    { openedAtMs: 0, closedAtMs: 3600_000, instrumentId: 'A,"B"', side: 'LONG', contracts: 2, entryPrice: 10.5, exitPrice: 11, pnlVnd: 1234.4, rMultiple: 1.234, plan: { onPlan: true } },
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].split(',')[0], 'Ngày mở');
  assert.equal(lines[1], '1970-01-01 00:00,1970-01-01 01:00,"A,""B""",Mua,2,10.5,11,1234,1.23,Có');
});
