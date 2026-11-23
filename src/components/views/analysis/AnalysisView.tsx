/**
 * Analysis module (`analysis`): research screens over imported historical series —
 * Volatility, Correlation, Seasonality, Spreads, Drawdown/returns.
 *
 * Data: GET /api/data/datasets (series list) and GET /api/market/candles (per series).
 * All computations run client-side with the deterministic library in `src/shared/analytics/`.
 * Lazy-loaded from App.tsx (default export).
 */
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CorrelationTab } from './CorrelationTab';
import { DrawdownTab } from './DrawdownTab';
import { SeasonalityTab } from './SeasonalityTab';
import { SpreadsTab } from './SpreadsTab';
import { VolatilityTab } from './VolatilityTab';
import { Notice, clearCandleCache, useSeriesOptions } from './shared';
import { useT, type TKey } from '../../../i18n';

const TABS: readonly { id: 'volatility' | 'correlation' | 'seasonality' | 'spreads' | 'drawdown'; label: TKey }[] = [
  { id: 'volatility', label: 'an.tab.volatility' },
  { id: 'correlation', label: 'an.tab.correlation' },
  { id: 'seasonality', label: 'an.tab.seasonality' },
  { id: 'spreads', label: 'an.tab.spreads' },
  { id: 'drawdown', label: 'an.tab.drawdown' },
];

type TabId = (typeof TABS)[number]['id'];

export default function AnalysisView() {
  const t = useT();
  const [tab, setTab] = useState<TabId>('volatility');
  const [reloadToken, setReloadToken] = useState(0);
  const { options, loading, error } = useSeriesOptions(reloadToken);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('an.title')}</h2>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            {t('an.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            clearCandleCache();
            setReloadToken((n) => n + 1);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/80 border border-[var(--border)] rounded-md text-xs font-medium text-[var(--text-strong)] whitespace-nowrap self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{t('an.reload')}</span>
        </button>
      </div>

      <div role="tablist" aria-label={t('an.tabsAria')} className="flex flex-wrap items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1.5 w-fit">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              tab === tb.id ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)]/70 hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)]'
            }`}
          >
            {t(tb.label)}
          </button>
        ))}
      </div>

      {error && <Notice tone="error">{t('an.loadError', { error })}</Notice>}
      {!loading && !error && options.length === 0 && (
        <Notice tone="warn">{t('an.noDatasets')}</Notice>
      )}

      <div role="tabpanel">
        {tab === 'volatility' && <VolatilityTab options={options} />}
        {tab === 'correlation' && <CorrelationTab options={options} />}
        {tab === 'seasonality' && <SeasonalityTab options={options} />}
        {tab === 'spreads' && <SpreadsTab options={options} />}
        {tab === 'drawdown' && <DrawdownTab options={options} />}
      </div>
    </div>
  );
}
