/**
 * Compact "Trạng thái hệ thống" panel for the Data Health view (GET /api/status, public, 15 s cache).
 * Plain Vietnamese; colour tokens only (no green/red).
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface StatusJob {
  id: string;
  lastRun: string | null;
  lastOk: string | null;
  lastError: string | null;
  nextRun: string | null;
}
interface SystemStatus {
  uptimeSec: number;
  version: string;
  memory: { rssMb: number };
  scheduler: { enabled: boolean; jobs: StatusJob[] };
  db: Array<{ file: string; bytes: number }>;
  errors: { last1h: number; last24h: number };
  latency: Array<{ route: string; p50: number; p95: number }>;
}

function fmtUptime(sec: number): string {
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} phút`;
  if (sec < 86400) return `${Math.round(sec / 3600)} giờ`;
  return `${Math.round(sec / 86400)} ngày`;
}
function fmtTime(iso: string | null): string {
  if (!iso) return 'chưa chạy';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('vi-VN');
}

export function SystemStatusPanel() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as SystemStatus);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dbMb = data ? data.db.reduce((n, f) => n + f.bytes, 0) / 1048576 : 0;
  const failing = data?.scheduler.jobs.filter((j) => j.lastError).length ?? 0;

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4" aria-label="Trạng thái hệ thống">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">Trạng thái hệ thống</h2>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Làm mới trạng thái hệ thống"
          className="p-1.5 rounded-md text-[var(--text)]/70 hover:text-[var(--text-strong)]"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--warning)]">Không tải được trạng thái máy chủ.</p>}
      {data && (
        <div className="mt-3 space-y-3 text-xs text-[var(--text)]/80">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <dt className="text-[var(--text)]/55">Đã chạy liên tục</dt>
              <dd className="text-[var(--text-strong)] font-medium">{fmtUptime(data.uptimeSec)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text)]/55">Bộ nhớ / dữ liệu</dt>
              <dd className="text-[var(--text-strong)] font-medium">
                {data.memory.rssMb} MB / {dbMb.toFixed(1)} MB
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text)]/55">Lỗi 1 giờ / 24 giờ</dt>
              <dd className={`font-medium ${data.errors.last1h > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-strong)]'}`}>
                {data.errors.last1h} / {data.errors.last24h}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text)]/55">Tác vụ tự động</dt>
              <dd className={`font-medium ${failing > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-strong)]'}`}>
                {data.scheduler.enabled ? `${data.scheduler.jobs.length} tác vụ` : 'đang tắt'}
                {failing > 0 ? `, ${failing} gặp lỗi` : ''}
              </dd>
            </div>
          </dl>
          <details>
            <summary className="cursor-pointer text-[var(--accent-text)]">Chi tiết tác vụ và tốc độ phản hồi</summary>
            <ul className="mt-2 space-y-1">
              {data.scheduler.jobs.map((j) => (
                <li key={j.id}>
                  <span className="text-[var(--text-strong)]">{j.id}</span>: lần cuối {fmtTime(j.lastRun)}, lần tới{' '}
                  {fmtTime(j.nextRun)}
                  {j.lastError ? <span className="text-[var(--warning)]"> (có lỗi lần gần nhất)</span> : null}
                </li>
              ))}
              {data.latency.map((l) => (
                <li key={l.route}>
                  {l.route}: p50 {l.p50} ms, p95 {l.p95} ms
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
