import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import {
  backupObjectName,
  backupOnShutdown,
  createSnapshot,
  integrityOk,
  needsRestore,
  readBackupConfig,
  restoreIfMissing,
  restoreOnStartup,
  runBackup,
  selectObjectsToDelete,
  type BackupStorage,
} from './sqliteBackup.ts';

function mockStorage(): BackupStorage & { objects: Map<string, Buffer>; calls: string[] } {
  const objects = new Map<string, Buffer>();
  const calls: string[] = [];
  return {
    objects,
    calls,
    async upload(n, d) {
      calls.push(`up:${n}`);
      objects.set(n, d);
    },
    async download(n) {
      calls.push(`down:${n}`);
      const b = objects.get(n);
      if (!b) throw Object.assign(new Error('nf'), { code: 404 });
      return b;
    },
    async list() {
      return [...objects.keys()].filter((k) => k.startsWith('market-'));
    },
    async remove(n) {
      calls.push(`rm:${n}`);
      objects.delete(n);
    },
  };
}

function makeDb(dir: string): string {
  const f = path.join(dir, 'market.db');
  const db = new DatabaseSync(f);
  db.exec('CREATE TABLE t(a INTEGER); INSERT INTO t VALUES (1),(2),(3);');
  db.close();
  return f;
}

test('config disabled without env, defaults and overrides', () => {
  assert.equal(readBackupConfig({}), null);
  assert.deepEqual(readBackupConfig({ GCS_BACKUP_BUCKET: 'b' }), { bucket: 'b', keep: 14, intervalHours: 6 });
  assert.deepEqual(readBackupConfig({ GCS_BACKUP_BUCKET: 'b', GCS_BACKUP_KEEP: '3', GCS_BACKUP_INTERVAL_HOURS: '2' }), {
    bucket: 'b',
    keep: 3,
    intervalHours: 2,
  });
});

test('object name format', () => {
  assert.equal(backupObjectName(new Date(Date.UTC(2026, 10, 24, 9, 5))), 'market-20261124-0905.db.gz');
});

test('retention deletes oldest beyond keep, ignores latest/others', () => {
  const names = ['latest', 'other.txt', 'market-20261103-0000.db.gz', 'market-20261101-0000.db.gz', 'market-20261102-0000.db.gz'];
  assert.deepEqual(selectObjectsToDelete(names, 2), ['market-20261101-0000.db.gz']);
  assert.deepEqual(selectObjectsToDelete(names, 5), []);
});

test('snapshot is valid and backup uploads + prunes', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 't53-'));
  try {
    const file = makeDb(dir);
    const snap = path.join(dir, 'snap.db');
    createSnapshot(file, snap);
    assert.equal(integrityOk(snap), true);
    const storage = mockStorage();
    storage.objects.set('market-20200101-0000.db.gz', Buffer.from('x'));
    storage.objects.set('market-20200102-0000.db.gz', Buffer.from('x'));
    const res = await runBackup({ storage, dbFile: file, keep: 2, now: new Date(Date.UTC(2026, 0, 1)) });
    assert.equal(res.name, 'market-20260101-0000.db.gz');
    assert.deepEqual(res.deleted, ['market-20200101-0000.db.gz']);
    assert.ok(storage.objects.has('latest'));
    const raw = gunzipSync(storage.objects.get('latest')!);
    assert.ok(raw.subarray(0, 15).toString().startsWith('SQLite format 3'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('restore only when DB missing or empty', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 't53-'));
  try {
    const src = makeDb(dir);
    const storage = mockStorage();
    await runBackup({ storage, dbFile: src, keep: 5 });
    storage.calls.length = 0;
    assert.equal(await restoreIfMissing({ storage, dbFile: src }), 'skipped-existing');
    assert.deepEqual(storage.calls, []);
    const target = path.join(dir, 'sub', 'restored.db');
    assert.equal(needsRestore(target), true);
    assert.equal(await restoreIfMissing({ storage, dbFile: target }), 'restored');
    assert.equal(integrityOk(target), true);
    const empty = path.join(dir, 'empty.db');
    writeFileSync(empty, '');
    assert.equal(await restoreIfMissing({ storage, dbFile: empty }), 'restored');
    assert.equal(await restoreIfMissing({ storage: mockStorage(), dbFile: path.join(dir, 'none.db') }), 'no-backup');
    const bad = mockStorage();
    bad.objects.set('latest', Buffer.from('not gzip'));
    const badTarget = path.join(dir, 'bad.db');
    assert.equal(await restoreIfMissing({ storage: bad, dbFile: badTarget }), 'failed');
    assert.equal(existsSync(badTarget), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('disabled without env: restore and shutdown backup are no-ops', async () => {
  assert.equal(await restoreOnStartup({}), 'disabled');
  await backupOnShutdown(50, {});
});

test('after a failed startup restore, configured backup refuses to overwrite remote latest', async () => {
  const { runConfiguredBackup, _setRestoreFailedForTest } = await import('./sqliteBackup.ts');
  _setRestoreFailedForTest(true);
  try {
    await assert.rejects(runConfiguredBackup({ GCS_BACKUP_BUCKET: 'b' }), /restore failed/);
  } finally {
    _setRestoreFailedForTest(false);
  }
});
