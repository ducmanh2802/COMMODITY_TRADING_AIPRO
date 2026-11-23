/** T53 - POST /api/admin/backup: trigger a SQLite -> GCS backup now (admin only). */
import type { Express, RequestHandler } from 'express';
import { readBackupConfig, runConfiguredBackup } from '../services/backup/sqliteBackup.ts';

export function registerBackupRoutes(app: Express, deps: { requireAdmin: RequestHandler }): void {
  app.post('/api/admin/backup', deps.requireAdmin, async (_req, res) => {
    if (!readBackupConfig()) {
      res.status(409).json({ error: 'BACKUP_DISABLED', message: 'GCS_BACKUP_BUCKET is not set.' });
      return;
    }
    try {
      const r = await runConfiguredBackup();
      res.json({ ok: true, name: r.name, bytes: r.bytes, deleted: r.deleted.length });
    } catch (err) {
      res.status(502).json({ error: 'BACKUP_FAILED', message: err instanceof Error ? err.message.slice(0, 300) : 'unknown error' });
    }
  });
}
