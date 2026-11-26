import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useT } from '../../../i18n';
import type { CycleMarketOverview } from '../../../shared/types/cycle';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
import { CyclePhaseBadge } from '../../common/CyclePhaseBadge';
import { lazyWithRetry } from '../../common/lazyWithRetry';
import { EmptyState } from '../../ui/EmptyState';
import { DualViewTabs } from '../DualViewTabs';
import { LegacyModule } from '../LegacyModule';
import { LazyCycleScannerView, LazyPaperTradingView, LazyResearchNotebookView } from '../LazyOwnerViews';
import { TodayPanel } from '../today/TodayPanel';
import { WatchlistPanel } from '../../watchlist/WatchlistPanel';
import { NewsFeed } from '../news/NewsFeed';
import { MacroPanel } from '../news/MacroPanel';
import { CalendarPanel } from '../news/CalendarPanel';

// Heavy tab panels load on demand so the entry bundle stays small (LCP).
const RadarView = lazyWithRetry(() => import('../radar/RadarView'), (m) => m.RadarView, undefined, 'RadarView');
const MarketPulsePanel = lazyWithRetry(() => import('../pulse/MarketPulsePanel'), (m) => m.MarketPulsePanel, undefined, 'MarketPulsePanel');
const WorldMarketsPanel = lazyWithRetry(() => import('../world/WorldMarketsPanel'), (m) => m.WorldMarketsPanel, undefined, 'WorldMarketsPanel');
const WeatherPanel = lazyWithRetry(() => import('../weather/WeatherPanel'), (m) => m.WeatherPanel, undefined, 'WeatherPanel');
const DriversPanel = lazyWithRetry(() => import('../drivers/DriversPanel'), (m) => m.DriversPanel, undefined, 'DriversPanel');
const HedgeWizard = lazyWithRetry(() => import('../hedge/HedgeWizard'), (m) => m.HedgeWizard, undefined, 'HedgeWizard');
const InstrumentOverview = lazyWithRetry<typeof import('../instrument/InstrumentOverview'), { cycleSlot?: ReactNode }>(
  () => import('../instrument/InstrumentOverview'),
  (m) => m.InstrumentOverview,
  undefined,
  'InstrumentOverview'
);
const DomesticPricesPanel = lazyWithRetry(() => import('../domestic/DomesticPricesPanel'), (m) => m.DomesticPricesPanel, undefined, 'DomesticPricesPanel');
const TradePerformanceChart = lazyWithRetry(() => import('../analysis/TradePerformanceChart'), (m) => m.TradePerformanceChart, undefined, 'TradePerformanceChart');

interface HubProps {
  tab?: string;
  sub?: string;
}

const PRICE_MODES = ['cards', 'table', 'watch'] as const;
const PRICE_MODE_LABEL = { cards: 'n2.mk.viewCards', table: 'n2.mk.viewTable', watch: 'n2.mk.viewWatch' } as const;

/** Prices: cards (commodity world) | table (market watch) | the user's watchlist. */
function PricesTab({ initial }: { initial: string }) {
  const t = useT();
  const [mode, setMode] = useState(initial);
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border border-[var(--border)] overflow-hidden" role="group">
        {PRICE_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`px-3 min-h-9 text-xs ${mode === m ? 'bg-[var(--accent-soft)] text-[var(--text-strong)]' : 'text-[var(--muted)] hover:text-[var(--text-strong)]'}`}
          >
            {t(PRICE_MODE_LABEL[m])}
          </button>
        ))}
      </div>
      {mode === 'watch' ? <WatchlistPanel /> : <LegacyModule id={mode === 'cards' ? 'commodity-world' : 'markets'} />}
    </div>
  );
}

/** Section heading used when a tab stacks two former screens. */
function StackHeading({ children }: { children: string }) {
  return <h2 className="text-base font-semibold text-[var(--text-strong)]">{children}</h2>;
}

export function TodayHub({ tab }: HubProps) {
  const t = useT();
  return (
    <DualViewTabs
      key={`today-${tab ?? ''}`}
      initialTabId={tab ?? 'overview'}
      tabs={[
        { id: 'overview', label: t('n2.td.overview'), note: '', render: () => <TodayPanel /> },
        {
          id: 'highlights',
          label: t('n2.td.highlights'),
          note: '',
          render: () => (
            <div className="space-y-8">
              <RadarView />
              <section className="space-y-3">
                <StackHeading>{t('n2.an.cycle')}</StackHeading>
                <LazyCycleScannerView embedded />
              </section>
            </div>
          ),
        },
      ]}
    />
  );
}

export function MarketHub({ tab, sub }: HubProps) {
  const t = useT();
  return (
    <DualViewTabs
      key={`market-${tab ?? ''}-${sub ?? ''}`}
      initialTabId={tab ?? 'prices'}
      tabs={[
        { id: 'prices', label: t('n2.mk.prices'), note: '', render: () => <PricesTab initial={sub ?? 'cards'} /> },
        { id: 'world', label: t('wd.tab'), note: '', render: () => <WorldMarketsPanel /> },
        { id: 'domestic', label: t('dm.tab'), note: '', render: () => <DomesticPricesPanel /> },
        { id: 'weather', label: t('wx.tab'), note: '', render: () => <WeatherPanel /> },
      ]}
    />
  );
}

export function NewsHub({ tab }: HubProps) {
  const t = useT();
  return (
    <DualViewTabs
      key={`news-${tab ?? ''}`}
      initialTabId={tab ?? 'news'}
      tabs={[
        { id: 'news', label: t('n2.nw.news'), note: '', render: () => <NewsFeed /> },
        {
          id: 'macro',
          label: t('n2.nw.macro'),
          note: '',
          render: () => (
            <div className="space-y-8">
              <MarketPulsePanel />
              <MacroPanel />
            </div>
          ),
        },
        { id: 'calendar', label: t('n2.nw.calendar'), note: '', render: () => <CalendarPanel /> },
      ]}
    />
  );
}

export function AnalysisHub({ tab }: HubProps) {
  const t = useT();
  const { openInstrumentIn } = useTerminal();
  return (
    <DualViewTabs
      key={`analysis-${tab ?? ''}`}
      initialTabId={tab ?? 'scorecard'}
      tabs={[
        {
          id: 'scorecard',
          label: t('n2.an.scorecard'),
          note: '',
          render: () => <LegacyModule id="scorecard" onOpenInstrument={(s) => openInstrumentIn(s, 'instrument')} />,
        },
        { id: 'performance', label: t('n2.an.performance'), note: '', render: () => <TradePerformanceChart /> },
        { id: 'report', label: t('n2.an.report'), note: '', render: () => <LegacyModule id="research-report" /> },
      ]}
    />
  );
}

export function SettingsHub({ tab }: HubProps) {
  const t = useT();
  return (
    <DualViewTabs
      key={`settings-${tab ?? ''}`}
      initialTabId={tab ?? 'prefs'}
      tabs={[
        { id: 'prefs', label: t('n2.set.prefs'), note: '', render: () => <LegacyModule id="settings" /> },
        { id: 'data', label: t('n2.item.data-health'), note: '', render: () => <LegacyModule id="data-health" /> },
        { id: 'import', label: t('n2.item.data-import'), note: '', render: () => <LegacyModule id="data-import" /> },
      ]}
    />
  );
}

/** Signal-style tools grouped under Advanced (research only, not recommendations). */
export function ScanHub({ tab }: HubProps) {
  const t = useT();
  return (
    <DualViewTabs
      key={`scan-${tab ?? ''}`}
      initialTabId={tab ?? 'scanner'}
      tabs={[
        { id: 'scanner', label: t('n2.item.scanner'), note: '', render: () => <LegacyModule id="scanner" /> },
        { id: 'signals', label: t('n2.item.signals'), note: '', render: () => <LegacyModule id="signals" /> },
        { id: 'technical', label: t('n2.item.technical'), note: '', render: () => <LegacyModule id="technical" /> },
      ]}
    />
  );
}

/** Compact per-instrument cycle readout (from /api/cycle/overview) for the selected symbol. */
function InstrumentCycleTab() {
  const t = useT();
  const { selectedSymbol, setActiveModule } = useTerminal();
  const [data, setData] = useState<CycleMarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchJsonWithRetry<CycleMarketOverview>('/api/cycle/overview', { signal: ctrl.signal })
      .then((d) => !ctrl.signal.aborted && setData(d))
      .catch(() => undefined)
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, []);
  const c = data?.commodities.find((x) => x.instrument.exchangeSymbol === selectedSymbol);
  if (loading) return <p className="text-sm text-[var(--muted)]">{t('n2.in.cycleLoading')}</p>;
  if (!c) return <EmptyState title={t('n2.in.cycleNone')} />;
  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[var(--muted)]">{t('n2.in.cyclePhase')}</span>
        <CyclePhaseBadge phase={c.cyclePhase} />
      </div>
      <div className="text-[var(--text)]">
        {t('n2.in.cycleBottom')}: {c.bottomScore ?? '—'}
      </div>
      <div className="text-[var(--text)]">
        {t('n2.in.cyclePct')}: {c.percentile10Y === null ? '—' : `${Math.round(c.percentile10Y)}%`}
      </div>
      <button type="button" onClick={() => setActiveModule('cycle-hunter')} className="text-xs underline text-[var(--accent-text)]">
        {t('n2.in.cycleScanner')}
      </button>
    </div>
  );
}

/** Per-instrument analysis page; every tab reads the instrument from TerminalContext.selectedSymbol. */
export function InstrumentPage({ tab }: HubProps) {
  const t = useT();
  const { selectedSymbol, setSelectedSymbol, instruments, setActiveModule } = useTerminal();
  const options = instruments.filter((i, idx, arr) => arr.findIndex((x) => x.exchangeSymbol === i.exchangeSymbol) === idx);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setActiveModule('analysis-hub')}
          className="inline-flex items-center min-h-10 sm:min-h-0 gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text-strong)]"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          {t('n2.in.back')}
        </button>
        <select
          aria-label={t('n2.in.pick')}
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
          className="w-full sm:w-auto min-w-0 max-w-full min-h-10 sm:min-h-0 bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1 text-sm text-[var(--text-strong)]"
        >
          {options.map((i) => (
            <option key={i.exchangeSymbol} value={i.exchangeSymbol}>
              {i.exchangeSymbol} · {i.productName}
            </option>
          ))}
        </select>
      </div>
      <DualViewTabs
        key={`instrument-${tab ?? ''}`}
        initialTabId={tab ?? 'summary'}
        tabs={[
          {
            id: 'summary',
            label: t('n2.in.summary'),
            note: '',
            render: () => (
              <InstrumentOverview cycleSlot={<InstrumentCycleTab />} />
            ),
          },
          { id: 'charts', label: t('n2.in.charts'), note: '', render: () => <LegacyModule id="charts" /> },
          { id: 'drivers', label: t('drv.tab'), note: '', render: () => <DriversPanel /> },
          { id: 'cot', label: t('n2.in.cot'), note: '', render: () => <LegacyModule id="cot" /> },
          {
            id: 'profile',
            label: t('n2.in.profileAi'),
            note: '',
            render: () => (
              <div className="space-y-8">
                <LegacyModule id="commodity-profile" />
                <section className="space-y-3">
                  <StackHeading>{t('n2.in.ai')}</StackHeading>
                  <LegacyModule id="ai-analyst" />
                </section>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

export function MineHub({ tab }: HubProps) {
  const t = useT();
  return (
    <DualViewTabs
      key={`mine-${tab ?? ''}`}
      initialTabId={tab ?? 'notebook'}
      tabs={[
        { id: 'notebook', label: t('n2.me.notebook'), note: t('nb.tab.notebookNote'), render: () => <LazyResearchNotebookView /> },
        { id: 'journal', label: t('n2.me.journal'), note: t('nb.tab.journalNote'), render: () => <LegacyModule id="journal" /> },
        {
          id: 'risk',
          label: t('n2.me.risk'),
          note: '',
          render: () => (
            <div className="space-y-8">
              <LegacyModule id="risk" />
              <section className="space-y-3">
                <StackHeading>{t('n2.item.portfolio')}</StackHeading>
                <LegacyModule id="portfolio" />
              </section>
            </div>
          ),
        },
        { id: 'hedge', label: t('hd.tab'), note: '', render: () => <HedgeWizard /> },
        { id: 'paper', label: t('n2.me.paper'), note: '', render: () => <LazyPaperTradingView /> },
      ]}
    />
  );
}
