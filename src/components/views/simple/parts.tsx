import { AlertTriangle, ArrowDown, ArrowUp, CircleSlash } from 'lucide-react';
import { fmtDate, fmtInt, fmtNum, type TFunction } from '../../../i18n';
import { fmtPrice, plainUnit } from '../../common/quoteFormat';
import { fmtBenchmarkPeriod } from '../../common/quoteFormat';
import type { SimpleRow } from './model';
import type { Light } from './units';

export const LIGHT_STYLE: Record<Light, { dot: string; text: string; border: string; bg: string }> = {
  green: { dot: '#22C55E', text: '#86EFAC', border: '#22C55E', bg: 'rgba(34,197,94,0.14)' },
  red: { dot: '#EF4444', text: '#FCA5A5', border: '#EF4444', bg: 'rgba(239,68,68,0.14)' },
  yellow: { dot: '#FBBF24', text: '#FDE68A', border: '#FBBF24', bg: 'rgba(251,191,36,0.14)' },
  gray: { dot: '#94A3B8', text: '#CBD5E1', border: '#64748B', bg: 'rgba(148,163,184,0.12)' },
};

const LIGHT_ICON = { green: ArrowUp, red: ArrowDown, yellow: AlertTriangle, gray: CircleSlash } as const;

/** Traffic-light pill: coloured dot + icon + words (never colour alone). */
export function LightBadge({ light, t, big = false }: { light: Light; t: TFunction; big?: boolean }) {
  const s = LIGHT_STYLE[light];
  const Icon = LIGHT_ICON[light];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border-2 font-bold ${big ? 'px-4 py-2 text-xl' : 'px-3 py-1.5 text-lg'}`}
      style={{ color: s.text, borderColor: s.border, background: s.bg }}
    >
      <Icon className={big ? 'w-6 h-6' : 'w-5 h-5'} aria-hidden="true" />
      {t(`sm.light.${light}`)}
    </span>
  );
}

export function fmtPct(p: number): string {
  const sign = p > 0 ? '+' : p < 0 ? '−' : '';
  return `${sign}${fmtNum(Math.abs(p), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

/** Which VND unit is shown first: kg for farm goods, tonne for metals/energy. */
export function primaryUnit(row: SimpleRow): 'kg' | 'ton' {
  const c = row.instrument.category;
  return c === 'AGRICULTURE' || c === 'SOFT_COMMODITIES' ? 'kg' : 'ton';
}

/** One plain sentence about the commodity today (also what "Đọc to" reads). */
export function summaryText(t: TFunction, row: SimpleRow): string {
  const name = row.name;
  if (!row.hasPrice) return t('sm.sum.none', { name });
  if (row.stale) return t('sm.sum.stale', { name });
  if (row.changePct === null || row.period === null) return t('sm.sum.nocmp', { name });
  const period = t(row.period === 'd1' ? 'sm.per.d1' : 'sm.per.w1');
  if (row.light === 'green') return t('sm.sum.up', { name, pct: fmtPct(row.changePct).replace('+', ''), period });
  if (row.light === 'red') return t('sm.sum.down', { name, pct: fmtPct(row.changePct).replace('−', ''), period });
  return t('sm.sum.flat', { name, period });
}

/** A number in the unit shown to the user: VND per kg/tonne when exactly convertible, else the exchange unit. */
export function displayValue(row: SimpleRow, native: number, convert: (native: number) => number | null): string {
  const v = convert(native);
  return v !== null ? fmtInt(v) : fmtPrice(native);
}

export function BigPrice({ row, t, size = 'card' }: { row: SimpleRow; t: TFunction; size?: 'card' | 'detail' }) {
  const big = size === 'detail' ? 'text-5xl' : 'text-4xl';
  if (!row.hasPrice || !row.quote) {
    return <div className={`${big} font-bold text-[var(--faint)]`} aria-label={t('sm.light.gray')}>—</div>;
  }
  if (row.conv) {
    const unit = primaryUnit(row);
    const main = unit === 'kg' ? row.conv.vndPerKg : row.conv.vndPerTon;
    return (
      <div>
        <div className="flex items-baseline flex-wrap gap-x-2">
          <span className={`${big} font-extrabold tabular-nums text-white`}>{fmtInt(main)}</span>
          <span className="text-xl font-semibold text-[var(--text)]">{unit === 'kg' ? 'đ/kg' : 'đ/tấn'}</span>
        </div>
        {unit === 'kg' && size === 'detail' && (
          <div className="text-lg text-[var(--text)] mt-1">{t('sm.price.alsoTon', { ton: fmtInt(row.conv.vndPerTon) })}</div>
        )}
      </div>
    );
  }
  return (
    <div>
      <span className={`${big} font-extrabold tabular-nums text-white`}>{fmtPrice(row.quote.price as number)}</span>
      <div className="text-lg text-[var(--text)]">{plainUnit(t, row.quote)}</div>
    </div>
  );
}

/** Data quality in plain words (freshness + how reliable the source is). */
export function qualityLines(t: TFunction, row: SimpleRow): string[] {
  const q = row.quote;
  if (!row.hasPrice || !q) return [t('sm.q.none'), t('sm.trust.none')];
  let fresh: string;
  if (q.kind === 'BENCHMARK' && q.benchmark) {
    fresh = t('sm.q.bench', { period: fmtBenchmarkPeriod(q.benchmark.period) });
  } else if (q.status === 'CURRENT' || q.status === 'DELAYED') {
    fresh = t('sm.q.live');
  } else if (q.status === 'HISTORICAL') {
    fresh = t('sm.q.hist', { date: fmtDate(q.timestamp) });
  } else {
    fresh = t('sm.q.stale');
  }
  const trust = q.sourceQuality === 'UNOFFICIAL' ? t('sm.trust.mid') : t('sm.trust.good');
  return [fresh, trust];
}
