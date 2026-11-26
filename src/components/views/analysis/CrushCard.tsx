/**
 * Soybean board crush card (education only), shown at the top of the Analysis > Spreads tab because the
 * crush is an inter-commodity spread and the tab already loads/validates imported series.
 * Uses only already-imported D1 series of CBOT:ZS / ZM / ZL; a missing leg shows "chưa có dữ liệu".
 */
import { useMemo } from 'react';
import { useI18n } from '../../../i18n';
import type { SeriesOption } from '../../../api/analysisApi';
import { Sparkline } from '../../ui/viz/Sparkline';
import { DEFAULT_Z_WINDOW, crushSeasonal, crushSeries, crushZScore } from '../../../shared/analytics/crush';
import { Panel, fmtDate, fmtNum, useLoadedSeries } from './shared';

const LEGS = ['ZM', 'ZL', 'ZS'] as const;
const SPARK_BARS = 120;

function pickD1(options: SeriesOption[], instrumentId: string): SeriesOption | undefined {
  const c = options.filter((o) => o.instrumentId === instrumentId && o.timeframe === 'D1');
  return c.find((o) => o.contractCode === 'CONTINUOUS') ?? c[0];
}

export function CrushCard({ options }: { options: SeriesOption[] }) {
  const { t } = useI18n();
  const picks = useMemo(() => LEGS.map((l) => ({ leg: l, opt: pickD1(options, `CBOT:${l}`) })), [options]);
  const selected = useMemo(() => picks.map((p) => p.opt).filter((o): o is SeriesOption => !!o), [picks]);
  const missing = picks.filter((p) => !p.opt).map((p) => p.leg);
  const { data, loading } = useLoadedSeries(selected);

  const crush = useMemo(() => {
    if (missing.length > 0) return null;
    const get = (leg: string) => data.find((d) => d.option.instrumentId === `CBOT:${leg}`)?.closes;
    const zm = get('ZM');
    const zl = get('ZL');
    const zs = get('ZS');
    if (!zm || !zl || !zs) return null;
    return crushSeries(zm, zl, zs);
  }, [data, missing.length]);

  const z = useMemo(() => (crush ? crushZScore(crush.values, DEFAULT_Z_WINDOW) : null), [crush]);
  const seasonal = useMemo(() => (crush ? crushSeasonal(crush.timestamps, crush.values) : null), [crush]);
  const last = crush && crush.values.length > 0 ? crush.values.length - 1 : -1;
  const spark = useMemo(
    () =>
      crush
        ? crush.values.slice(-SPARK_BARS).map((v, i, arr) => ({ label: fmtDate(crush.timestamps[crush.values.length - arr.length + i]), value: v }))
        : [],
    [crush]
  );

  let zChip: { text: string; warn: boolean } | null = null;
  if (z) {
    if (z.status === 'OK' && z.z !== null) zChip = { text: t('crushcard.zChip', { n: z.window, z: fmtNum(z.z, 2) }), warn: Math.abs(z.z) >= 2 };
    else if (z.status === 'INSUFFICIENT_DATA') zChip = { text: t('crushcard.zInsufficient', { n: z.window, have: crush?.values.length ?? 0 }), warn: true };
    else if (z.status === 'ZERO_VARIANCE') zChip = { text: t('crushcard.zFlat'), warn: true };
    else zChip = { text: t('crushcard.zInvalid'), warn: true };
  }

  return (
    <Panel title={t('crushcard.title')} subtitle={t('crushcard.subtitle')}>
      <div data-testid="crush-card" className="space-y-3">
        {missing.length > 0 && (
          <ul className="space-y-1 text-xs text-[var(--warning)]">
            {missing.map((l) => (
              <li key={l}>{t('crushcard.missingLeg', { leg: l })}</li>
            ))}
          </ul>
        )}
        {missing.length > 0 && <p className="text-xs text-[var(--muted)]">{t('crushcard.needAll')}</p>}
        {missing.length === 0 && loading && <p className="text-xs text-[var(--muted)]">{t('crushcard.loading')}</p>}
        {crush && last >= 0 && (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                <p className="text-[11px] text-[var(--muted)]">{t('crushcard.current')}</p>
                <p className="text-2xl font-semibold tabular-nums text-[var(--text-strong)]" data-testid="crush-value">
                  {fmtNum(crush.values[last], 2)} <span className="text-xs font-normal text-[var(--muted)]">{t('crushcard.unit')}</span>
                </p>
                <p className="text-[11px] text-[var(--muted)]">{t('crushcard.asOf', { date: fmtDate(crush.timestamps[last]) })}</p>
              </div>
              {zChip && (
                <span
                  data-testid="crush-z"
                  className={`inline-flex items-center min-h-[40px] rounded-full border px-3 text-xs font-medium ${
                    zChip.warn
                      ? 'border-[var(--warning)] text-[var(--warning)]'
                      : 'border-[var(--accent)] text-[var(--accent-text)]'
                  }`}
                >
                  {zChip.text}
                </span>
              )}
              {spark.length >= 2 && (
                <div className="w-40" role="img" aria-label={t('crushcard.sparkAria')}>
                  <Sparkline points={spark} format={(v) => fmtNum(v, 2)} className="h-10" />
                </div>
              )}
            </div>
            {seasonal && seasonal.years > 0 && (
              <div>
                <p className="text-[11px] text-[var(--muted)] mb-1">{t('crushcard.seasonTitle', { years: seasonal.years })}</p>
                <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 text-[11px] tabular-nums text-[var(--text)]">
                  {seasonal.months.map((m) => (
                    <li key={m.month} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1">
                      {m.avg === null ? `T${m.month}: —` : t('crushcard.seasonCell', { month: m.month, avg: fmtNum(m.avg, 2), n: m.n })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <details className="rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
          <summary className="cursor-pointer min-h-[44px] flex items-center px-3 text-xs font-medium text-[var(--accent-text)]">
            {t('crushcard.explain')}
          </summary>
          <div className="space-y-2 px-3 pb-3 text-xs text-[var(--text)]">
            <p>{t('crushcard.what')}</p>
            <p>{t('crushcard.who')}</p>
            <p>{t('crushcard.zNote', { n: DEFAULT_Z_WINDOW })}</p>
            <p>{t('crushcard.caveat')}</p>
            <p className="text-[var(--muted)]">{t('crushcard.sources')}</p>
          </div>
        </details>
      </div>
    </Panel>
  );
}
