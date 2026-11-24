import { useEffect, useMemo, useState } from 'react';
import { Coffee } from 'lucide-react';
import { fmtDateTime, useT } from '../../../i18n';
import { COOL_OFF_DEFAULTS, coolOffTradesFromState, evaluateCoolOff } from './coolOff';
import { setCoolOffEnabled, useCoolOffEnabled } from './coolOffPrefs';
import { fmtPct } from './paperUi';

type StateLike = Parameters<typeof coolOffTradesFromState>[0];

function useNow(periodMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), periodMs);
    return () => window.clearInterval(id);
  }, [periodMs]);
  return now;
}

/** Calm notice shown while new paper orders are paused by the cool-off rule (renders nothing otherwise). */
export function CoolOffBanner({ state }: { state: StateLike }) {
  const t = useT();
  const enabled = useCoolOffEnabled();
  const tick = useNow(30_000);
  // Re-read the clock whenever trades change: `tick` is up to 30s stale and would ignore a trade closed just now.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Math.max(tick, Date.now()), [tick, state]);
  const r = useMemo(() => (enabled ? evaluateCoolOff(coolOffTradesFromState(state), now) : null), [enabled, state, now]);
  if (!r || !r.locked || r.until === null) return null;
  const leftMin = Math.max(1, Math.ceil((r.until - now) / 60_000));
  const h = Math.floor(leftMin / 60);
  const m = leftMin % 60;
  const left = h > 0 ? t('co.left.hm', { h, m }) : t('co.left.m', { m });
  return (
    <section role="status" aria-live="polite" className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-3 text-xs space-y-1.5 min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-strong)]">
        <Coffee className="h-4 w-4 shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
        {t('co.title')}
      </h3>
      <p className="text-[var(--text-strong)]">
        {r.reason === 'streak'
          ? t('co.reason.streak', { n: Math.max(r.stats.lossStreak, COOL_OFF_DEFAULTS.streak) })
          : t('co.reason.dailyLoss', { pct: fmtPct(r.stats.todayPnlPct, 1), limit: COOL_OFF_DEFAULTS.dailyLossPct })}
      </p>
      <p className="font-mono text-[var(--text)]/80">{t('co.until', { time: fmtDateTime(r.until), left })}</p>
      <p className="text-[var(--text)]/75">{t('co.why')}</p>
      <p className="text-[var(--text)]/60">
        {t('co.allowed')} {t('co.offHint')}
      </p>
    </section>
  );
}

/** On/off switch for the cool-off rule (paper settings). */
export function CoolOffToggle() {
  const t = useT();
  const enabled = useCoolOffEnabled();
  return (
    <div className="flex items-start gap-3 rounded-md border border-[var(--border)] p-2 min-w-0">
      <input
        id="pt-cooloff"
        type="checkbox"
        role="switch"
        aria-checked={enabled}
        aria-describedby="pt-cooloff-hint"
        checked={enabled}
        onChange={(e) => setCoolOffEnabled(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
      />
      <div className="min-w-0">
        <label htmlFor="pt-cooloff" className="block text-[var(--text-strong)] cursor-pointer">{t('co.setting.label')}</label>
        <p id="pt-cooloff-hint" className="text-[var(--text)]/60">{t('co.setting.hint')}</p>
      </div>
    </div>
  );
}
