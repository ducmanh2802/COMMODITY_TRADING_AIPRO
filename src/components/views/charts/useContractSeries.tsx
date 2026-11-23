import { useCallback, useEffect, useState } from 'react';
import { fetchContractCandles, type ContractCandlesResponse } from '../../../api/dataApi';
import {
  formatContractMonthVi,
  readChartSeriesPref,
  resolveChartSeries,
  writeChartSeriesPref,
  type ChartSeriesPref,
  type ResolvedChartSeries,
} from '../../../shared/utils/contractChart';
import type { MarketCandle } from '../../../shared/types/market';
import { useI18n } from '../../../i18n';

/** Loads the quote contract's D1 series (when wanted) and resolves contract vs continuous. Preference is per instrument. */
export function useContractSeries(args: {
  instrumentId: string | null;
  quoteContractMonth: string | null | undefined;
  timeframe: string;
  continuous: MarketCandle[];
  reloadKey?: number;
}) {
  const { instrumentId, quoteContractMonth, timeframe, continuous, reloadKey = 0 } = args;
  const [pref, setPrefState] = useState<ChartSeriesPref>('CONTRACT');
  const [prefFor, setPrefFor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; res: ContractCandlesResponse } | null>(null);

  useEffect(() => {
    setPrefState(readChartSeriesPref(instrumentId));
    setPrefFor(instrumentId);
  }, [instrumentId]);

  const key = instrumentId && quoteContractMonth ? `${instrumentId}|${quoteContractMonth}` : null;
  const wantContract = key !== null && pref === 'CONTRACT' && prefFor === instrumentId && timeframe === 'D1';
  useEffect(() => {
    if (!wantContract || !instrumentId || !quoteContractMonth || !key) return;
    const ctrl = new AbortController();
    setLoaded(null);
    fetchContractCandles({ instrumentId, contractMonth: quoteContractMonth }, ctrl.signal)
      .then((res) => {
        if (!ctrl.signal.aborted) setLoaded({ key, res });
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [wantContract, instrumentId, quoteContractMonth, key, reloadKey]);

  const setPref = useCallback(
    (p: ChartSeriesPref) => {
      setPrefState(p);
      if (instrumentId) writeChartSeriesPref(instrumentId, p);
    },
    [instrumentId]
  );

  const contract = loaded && loaded.key === key ? (loaded.res as { status: 'OK' | 'UNAVAILABLE'; contractMonth: string | null; candles?: MarketCandle[] }) : null;
  const resolved: ResolvedChartSeries<MarketCandle> = resolveChartSeries<MarketCandle>({
    quoteContractMonth,
    pref,
    timeframe,
    contract,
    continuous,
  });
  return { resolved, pref, setPref, hasContractMonth: !!quoteContractMonth };
}

/** Chart header (contract label / continuous label), fallback note and the source selector. */
export function ContractSeriesBar({
  contractMonth,
  resolved,
  pref,
  setPref,
}: {
  contractMonth: string | null | undefined;
  resolved: ResolvedChartSeries<unknown>;
  pref: ChartSeriesPref;
  setPref: (p: ChartSeriesPref) => void;
}) {
  const { t } = useI18n();
  const m = formatContractMonthVi(contractMonth) ?? contractMonth ?? '';
  if (!contractMonth) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs" data-testid="contract-series-bar">
      <span className="font-semibold text-[var(--text-strong)]" data-testid="contract-series-label" data-source={resolved.source}>
        {resolved.source === 'CONTRACT' ? t('ins.ctr.label', { m: formatContractMonthVi(resolved.contractMonth) ?? m }) : t('ins.ctr.continuousLabel')}
      </span>
      <label className="inline-flex items-center gap-2 text-[var(--muted)]">
        {t('ins.ctr.selector')}
        <select
          value={pref}
          onChange={(e) => setPref(e.target.value === 'CONTINUOUS' ? 'CONTINUOUS' : 'CONTRACT')}
          className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text)]"
          data-testid="contract-series-select"
        >
          <option value="CONTRACT">{t('ins.ctr.optContract', { m })}</option>
          <option value="CONTINUOUS">{t('ins.ctr.optContinuous')}</option>
        </select>
      </label>
      {resolved.note && (
        <p className="basis-full text-[var(--warning)]" data-testid="contract-series-note">
          {t(resolved.note === 'intraday' ? 'ins.ctr.noteIntraday' : 'ins.ctr.noteUnavailable', { m })}
        </p>
      )}
    </div>
  );
}
