import { useState } from 'react';
import { useT } from '../../i18n';
import { MAX_NOTE_LENGTH, type WatchItem, type WatchZone } from '../../shared/watchlist/watchlist';
import { deleteWatchItem, saveWatchItem, useWatchlist } from './watchlistStore';
import { useWatchMeta } from './useWatchMeta';

type ZoneMode = 'none' | 'range' | 'up' | 'down';

function initialMode(zone: WatchZone | null): ZoneMode {
  return !zone ? 'none' : zone.kind === 'range' ? 'range' : zone.direction;
}

/** Note + price-zone editor (inline card). Also used by the panel for editing rows. */
export function WatchEditor({ symbol, item, onClose }: { symbol: string; item?: WatchItem; onClose: () => void }) {
  const t = useT();
  const { nameOf } = useWatchMeta();
  const z = item?.zone ?? null;
  const [note, setNote] = useState(item?.note ?? '');
  const [mode, setMode] = useState<ZoneMode>(initialMode(z));
  const [low, setLow] = useState(z?.kind === 'range' ? String(z.low) : '');
  const [high, setHigh] = useState(z?.kind === 'range' ? String(z.high) : '');
  const [level, setLevel] = useState(z?.kind === 'level' ? String(z.level) : '');
  const [error, setError] = useState(false);

  const num = (s: string): number | null => {
    const n = Number(s.replace(',', '.'));
    return s.trim() !== '' && Number.isFinite(n) ? n : null;
  };
  const submit = () => {
    let zone: WatchZone | null = null;
    if (mode === 'range') {
      const a = num(low);
      const b = num(high);
      if (a === null || b === null) return setError(true);
      zone = { kind: 'range', low: Math.min(a, b), high: Math.max(a, b) };
    } else if (mode === 'up' || mode === 'down') {
      const l = num(level);
      if (l === null) return setError(true);
      zone = { kind: 'level', level: l, direction: mode };
    }
    saveWatchItem(symbol, note, zone);
    onClose();
  };
  const field = 'w-full min-h-[40px] px-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text-strong)]';

  return (
    <div role="dialog" aria-label={t('wl.editor.title', { name: nameOf(symbol) })} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-4 space-y-3 text-sm text-[var(--text)] w-full max-w-sm">
      <strong className="block text-[var(--text-strong)]">{t('wl.editor.title', { name: nameOf(symbol) })}</strong>
      <label className="block space-y-1">
        <span className="text-xs text-[var(--muted)]">{t('wl.editor.note')}</span>
        <input className={field} value={note} maxLength={MAX_NOTE_LENGTH} placeholder={t('wl.editor.notePh')} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-[var(--muted)]">{t('wl.editor.zoneType')}</span>
        <select className={field} value={mode} onChange={(e) => setMode(e.target.value as ZoneMode)}>
          <option value="none">{t('wl.editor.zoneNone')}</option>
          <option value="range">{t('wl.editor.zoneRange')}</option>
          <option value="up">{t('wl.editor.zoneUp')}</option>
          <option value="down">{t('wl.editor.zoneDown')}</option>
        </select>
      </label>
      {mode === 'range' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs text-[var(--muted)]">{t('wl.editor.low')}</span>
            <input className={field} inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-[var(--muted)]">{t('wl.editor.high')}</span>
            <input className={field} inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} />
          </label>
        </div>
      )}
      {(mode === 'up' || mode === 'down') && (
        <label className="block space-y-1">
          <span className="text-xs text-[var(--muted)]">{t('wl.editor.level')}</span>
          <input className={field} inputMode="decimal" value={level} onChange={(e) => setLevel(e.target.value)} />
        </label>
      )}
      {error && <p className="text-xs text-[var(--negative)]">{t('wl.editor.invalid')}</p>}
      <p className="text-xs text-[var(--muted)]">{t('wl.editor.hint')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={submit} className="min-h-[40px] px-4 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold">
          {t('wl.editor.save')}
        </button>
        {item && (
          <button
            type="button"
            onClick={() => {
              deleteWatchItem(symbol);
              onClose();
            }}
            className="min-h-[40px] px-3 rounded-lg border border-[var(--border)] text-[var(--negative)] text-sm"
          >
            {t('wl.editor.remove')}
          </button>
        )}
        <button type="button" onClick={onClose} className="min-h-[40px] px-3 rounded-lg border border-[var(--border)] text-sm">
          {t('wl.editor.cancel')}
        </button>
      </div>
    </div>
  );
}

/** "☆ Theo dõi / ★ Đang theo dõi" toggle that opens the editor in a popover. */
export function WatchButton({ symbol }: { symbol: string }) {
  const t = useT();
  const { items } = useWatchlist();
  const item = items.find((i) => i.instrumentId === symbol);
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-pressed={!!item}
        aria-expanded={open}
        title={t(item ? 'wl.btn.titleOn' : 'wl.btn.titleAdd')}
        onClick={() => setOpen((o) => !o)}
        className={`min-h-[36px] px-3 rounded-lg border text-sm font-semibold ${item ? 'border-[var(--warning)] text-[var(--warning)]' : 'border-[var(--border)] text-[var(--text)] hover:text-[var(--text-strong)]'} bg-[var(--surface-2)]`}
      >
        {t(item ? 'wl.btn.on' : 'wl.btn.add')}
      </button>
      {open && (
        <div className="absolute z-40 mt-2 left-0 sm:left-auto sm:right-0 w-[min(24rem,calc(100vw-2rem))]">
          <WatchEditor symbol={symbol} item={item} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
