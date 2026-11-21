import { ArrowDown, ArrowUp, ExternalLink, Minus } from 'lucide-react';
import type { TailoredSupplyDemandItem } from '../../shared/types/cycle';

const QUALITY_VI: Record<string, string> = {
  OFFICIAL: 'nguồn chính thức',
  LICENSED_VENDOR: 'nhà cung cấp có bản quyền',
  UNOFFICIAL: 'nguồn không chính thức',
  BENCHMARK: 'chuẩn tham chiếu',
};
const STATUS_VI: Record<string, string> = {
  CURRENT: 'đang cập nhật',
  DELAYED: 'trễ',
  HISTORICAL: 'số liệu kỳ trước',
  STALE: 'đã cũ',
};

function Bars({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev === null || typeof prev !== 'number' || !Number.isFinite(prev) || prev < 0 || cur < 0) return null;
  const max = Math.max(cur, prev) || 1;
  return (
    <div className="mt-1 space-y-0.5" aria-hidden="true">
      <div className="h-1 rounded bg-[var(--border)] w-full overflow-hidden" title="Kỳ trước">
        <div className="h-full bg-[#64748B]" style={{ width: `${(prev / max) * 100}%` }} />
      </div>
      <div className="h-1 rounded bg-[var(--border)] w-full overflow-hidden" title="Kỳ này">
        <div className="h-full bg-[var(--accent)]" style={{ width: `${(cur / max) * 100}%` }} />
      </div>
    </div>
  );
}

export function SupplyDemandRow({ item }: { item: TailoredSupplyDemandItem }) {
  const ok = item.state === 'OK' && item.latestValue !== null;
  const Arrow = item.changeDir === 'UP' ? ArrowUp : item.changeDir === 'DOWN' ? ArrowDown : Minus;
  const quality = item.sourceQuality ? (QUALITY_VI[item.sourceQuality] ?? item.sourceQuality) : null;
  const status = item.dataStatus ? (STATUS_VI[item.dataStatus] ?? item.dataStatus) : null;
  return (
    <div className="py-3 space-y-1" data-sd-state={item.state ?? 'UNAVAILABLE'}>
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-[var(--text-strong)]">{item.labelVi}</span>
        {ok ? (
          <span className="text-[var(--text)] tabular-nums text-right">
            {item.valueText ?? `${item.latestValue} ${item.unit}`}
          </span>
        ) : null}
      </div>

      {ok ? (
        <>
          {item.changeText ? (
            <p className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
              <Arrow className="w-3 h-3 text-[#94A3B8]" aria-hidden="true" />
              {item.changeText}
            </p>
          ) : null}
          {typeof item.latestValue === 'number' ? (
            <Bars cur={item.latestValue} prev={typeof item.previousValue === 'number' ? item.previousValue : null} />
          ) : null}
          {item.extras?.map((e) => (
            <p key={e.label} className="text-[11px] text-[var(--muted)]">
              {e.label}: <span className="text-[var(--text)]">{e.value}</span>
            </p>
          ))}
          <p className="text-[10px] text-[var(--faint)]">
            {item.asOf ? `Kỳ số liệu: ${item.asOf} · ` : ''}
            {item.sourceName ?? item.sourceHint}
            {quality ? ` · ${quality}` : ''}
            {status ? ` · ${status}` : ''}
            {item.sourceUrl ? (
              <>
                {' · '}
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
                  xem nguồn <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                </a>
              </>
            ) : null}
          </p>
        </>
      ) : (
        <p className="text-[11px] text-[var(--muted)]">{item.hintVi ?? item.notes}</p>
      )}

      {item.supportHintVi ? <p className="text-[11px] text-[var(--faint)] italic">{item.supportHintVi}</p> : null}
    </div>
  );
}
