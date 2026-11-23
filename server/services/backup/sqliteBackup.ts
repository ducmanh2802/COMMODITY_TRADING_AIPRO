/** T53 - opt-in SQLite backup/restore to Google Cloud Storage (enabled only when GCS_BACKUP_BUCKET is set). */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import { logger } from '../../lib/logger.ts';

export const LATEST_POINTER = 'latest';
const NAME_RE = /^market-\d{8}-\d{4}\.db\.gz$/;

/** Minimal storage surface (GCS in production, in-memory mock in tests). */
export interface BackupStorage {
  upload(name: string, data: Buffer): Promise<void>;
  download(name: string): Promise<Buffer>;
  list(): Promise<string[]>;
  remove(name: string): Promise<void>;
}

export interface BackupConfig {
  bucket: string;
  keep: number;
  intervalHours: number;
}

export function readBackupConfig(env: Record<string, string | undefined> = process.env): BackupConfig | null {
  const bucket = env.GCS_BACKUP_BUCKET?.trim();
  if (!bucket) return null;
  const keep = Math.floor(Number(env.GCS_BACKUP_KEEP));
  const hours = Number(env.GCS_BACKUP_INTERVAL_HOURS);
  return {
    bucket,
    keep: Number.isFinite(keep) && keep >= 1 ? keep : 14,
    intervalHours: Number.isFinite(hours) && hours > 0 ? hours : 6,
  };
}

export function dbPath(env: Record<string, string | undefined> = process.env): string {
  return env.MARKET_DB_PATH?.trim() || path.join('data', 'market.db');
}

export function backupObjectName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `market-${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}.db.gz`;
}

/** Names to delete so only the newest `keep` backups remain (names sort chronologically). Ignores other objects. */
export function selectObjectsToDelete(names: string[], keep: number): string[] {
  const backups = names.filter((n) => NAME_RE.test(n)).sort();
  return backups.slice(0, Math.max(0, backups.length - Math.max(1, keep)));
}

/** Consistent snapshot of a live SQLite file via VACUUM INTO (destFile must not exist). */
export function createSnapshot(source: string, destFile: string): void {
  const db = new DatabaseSync(source);
  try {
    db.exec(`VACUUM INTO '${destFile.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
}

export function integrityOk(file: string): boolean {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const row = db.prepare('PRAGMA integrity_check').get() as Record<string, unknown> | undefined;
    return !!row && Object.values(row)[0] === 'ok';
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

export interface BackupResult {
  name: string;
  bytes: number;
  deleted: string[];
}

export async function runBackup(opts: {
  storage: BackupStorage;
  dbFile: string;
  keep: number;
  now?: Date;
}): Promise<BackupResult> {
  if (!existsSync(opts.dbFile)) throw new Error('Local DB file does not exist; nothing to back up.');
  const dir = mkdtempSync(path.join(tmpdir(), 'mkt-backup-'));
  try {
    const snap = path.join(dir, 'snapshot.db');
    createSnapshot(opts.dbFile, snap);
    if (!integrityOk(snap)) throw new Error('Snapshot failed integrity_check; upload skipped.');
    const gz = gzipSync(readFileSync(snap));
    const name = backupObjectName(opts.now ?? new Date());
    await opts.storage.upload(name, gz);
    await opts.storage.upload(LATEST_POINTER, gz);
    const deleted = selectObjectsToDelete(await opts.storage.list(), opts.keep);
    for (const old of deleted) {
      try {
        await opts.storage.remove(old);
      } catch {
        /* best effort */
      }
    }
    return { name, bytes: gz.length, deleted };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** True when a restore should be attempted: DB file missing or zero bytes. */
export function needsRestore(dbFile: string): boolean {
  try {
    return statSync(dbFile).size === 0;
  } catch {
    return true;
  }
}

export type RestoreOutcome = 'skipped-existing' | 'restored' | 'no-backup' | 'failed';

/** Never throws. Downloads `latest`, gunzips, verifies integrity, then moves it into place. */
export async function restoreIfMissing(opts: { storage: BackupStorage; dbFile: string }): Promise<RestoreOutcome> {
  if (!needsRestore(opts.dbFile)) return 'skipped-existing';
  let dir: string | null = null;
  try {
    let gz: Buffer;
    try {
      gz = await opts.storage.download(LATEST_POINTER);
    } catch (err) {
      if ((err as { code?: number }).code === 404) {
        logger.info('DB restore: no backup found in bucket; starting with an empty DB.');
        return 'no-backup';
      }
      throw err;
    }
    dir = mkdtempSync(path.join(tmpdir(), 'mkt-restore-'));
    const tmp = path.join(dir, 'restored.db');
    writeFileSync(tmp, gunzipSync(gz));
    if (!integrityOk(tmp)) throw new Error('Downloaded backup failed integrity_check.');
    mkdirSync(path.dirname(path.resolve(opts.dbFile)), { recursive: true });
    for (const suf of ['-wal', '-shm']) rmSync(opts.dbFile + suf, { force: true });
    try {
      renameSync(tmp, opts.dbFile);
    } catch {
      writeFileSync(opts.dbFile, readFileSync(tmp)); // cross-device fallback
    }
    logger.info('DB restore: restored market DB from latest backup.', { bytes: statSync(opts.dbFile).size });
    return 'restored';
  } catch (err) {
    logger.error('DB restore failed; starting with an empty DB.', { error: err instanceof Error ? err.message : 'unknown error' });
    return 'failed';
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

/** GCS-backed storage. Credentials come from ADC / GOOGLE_APPLICATION_CREDENTIALS (never read here). */
export async function createGcsStorage(bucketName: string): Promise<BackupStorage> {
  const { Storage } = await import('@google-cloud/storage');
  const bucket = new Storage().bucket(bucketName);
  return {
    async upload(name, data) {
      await bucket.file(name).save(data, { resumable: false, contentType: 'application/gzip' });
    },
    async download(name) {
      const [buf] = await bucket.file(name).download();
      return buf;
    },
    async list() {
      const [files] = await bucket.getFiles({ prefix: 'market-' });
      return files.map((f) => f.name);
    },
    async remove(name) {
      await bucket.file(name).delete();
    },
  };
}

export interface BackupStatus {
  enabled: boolean;
  lastBackupAt: string | null;
  lastBackupError: string | null;
  lastBackupName: string | null;
}

/** Set when startup restore failed: the local DB may be empty, so uploading it would clobber the good `latest`. */
let restoreFailed = false;
export function _setRestoreFailedForTest(v: boolean): void {
  restoreFailed = v;
}
let inflight: Promise<BackupResult> | null = null;

const state: BackupStatus = { enabled: false, lastBackupAt: null, lastBackupError: null, lastBackupName: null };

export function getBackupStatus(): BackupStatus {
  state.enabled = readBackupConfig() !== null;
  return { ...state };
}

/** Full backup using env config + GCS. Records status; rethrows so callers (job/route) can report. */
export async function runConfiguredBackup(env: Record<string, string | undefined> = process.env): Promise<BackupResult> {
  const cfg = readBackupConfig(env);
  if (!cfg) throw new Error('Backup disabled: GCS_BACKUP_BUCKET is not set.');
  if (restoreFailed) throw new Error('Backup skipped: startup restore failed, refusing to overwrite the remote backup with a possibly empty DB.');
  if (inflight) return inflight; // coalesce concurrent runs (route + job + shutdown)
  inflight = doConfiguredBackup(cfg, env).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doConfiguredBackup(cfg: BackupConfig, env: Record<string, string | undefined>): Promise<BackupResult> {
  try {
    const result = await runBackup({ storage: await createGcsStorage(cfg.bucket), dbFile: dbPath(env), keep: cfg.keep });
    state.lastBackupAt = new Date().toISOString();
    state.lastBackupError = null;
    state.lastBackupName = result.name;
    return result;
  } catch (err) {
    state.lastBackupError = (err instanceof Error ? err.message : 'unknown error').slice(0, 300);
    throw err;
  }
}

/** Startup restore from env config. Never throws. */
export async function restoreOnStartup(env: Record<string, string | undefined> = process.env): Promise<RestoreOutcome | 'disabled'> {
  const cfg = readBackupConfig(env);
  if (!cfg) return 'disabled';
  const file = dbPath(env);
  if (!needsRestore(file)) return 'skipped-existing';
  try {
    const out = await restoreIfMissing({ storage: await createGcsStorage(cfg.bucket), dbFile: file });
    if (out === 'failed') restoreFailed = true;
    return out;
  } catch (err) {
    restoreFailed = true;
    logger.error('DB restore failed; starting with an empty DB.', { error: err instanceof Error ? err.message : 'unknown error' });
    return 'failed';
  }
}

/** Graceful-shutdown backup, capped at `capMs`. Never throws. */
export async function backupOnShutdown(capMs = 20_000, env: Record<string, string | undefined> = process.env): Promise<void> {
  if (!readBackupConfig(env)) return;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      runConfiguredBackup(env),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error('shutdown backup timed out')), capMs);
      }),
    ]);
    logger.info('Shutdown backup uploaded.');
  } catch (err) {
    logger.warn('Shutdown backup failed', { error: err instanceof Error ? err.message : 'unknown error' });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
