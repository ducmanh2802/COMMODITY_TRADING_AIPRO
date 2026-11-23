import { fmtNum, useT, type TKey } from '../../../i18n';
import type { ObvSummary } from '../../../shared/types/cycle';

/** Which plain-language sentence describes this OBV reading (divergence outranks the EMA signal). */
export function obvSayKey(obv: ObvSummary | null | undefined): TKey {
  if (!obv) return 'obv.say.NA';
  if (obv.divergence === 'BEARISH') return 'obv.say.BEARISH';
  if (obv.divergence === 'BULLISH') return 'obv.say.BULLISH';
  if (obv.signal === 'ABOVE_EMA') return 'obv.say.UP';
  if (obv.signal === 'BELOW_EMA') return 'obv.say.DOWN';
  if (obv.signal === 'FLAT') return 'obv.say.FLAT';
  return 'obv.say.NA';
}

/** OBV value, its EMA, the divergence flag and a one-line explanation. */
export function ObvReadout({ obv, className = '' }: { obv: ObvSummary | null | undefined; className?: string }) {
  const t = useT();
  const fmt = (v: number | null) => (v === null ? '-' : fmtNum(v, { maximumFractionDigits: 0 }));
  return (
    <div className={`space-y-1.5 ${className}`}>
      {obv && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-[var(--muted)]">
          <div className="min-w-0">
            <dt className="inline">{t('obv.value')}: </dt>
            <dd className="inline text-[var(--text-strong)]">{fmt(obv.value)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="inline">{t('obv.ema', { n: obv.emaPeriod })}: </dt>
            <dd className="inline text-[var(--text-strong)]">{fmt(obv.ema)}</dd>
          </div>
          <div className="col-span-2 min-w-0">
            <dt className="inline">{t('obv.divergence', { n: obv.lookback })}: </dt>
            <dd className="inline text-[var(--text-strong)]">{t(`obv.div.${obv.divergence}` as TKey)}</dd>
          </div>
        </dl>
      )}
      <p className="text-xs leading-snug text-[var(--text)]/75">{t(obvSayKey(obv))}</p>
    </div>
  );
}
