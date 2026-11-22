import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useT } from '../../../i18n';
import type { CycleMarketOverview } from '../../../shared/types/cycle';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
import { CyclePhaseBadge } from '../../common/CyclePhaseBadge';
import { EmptyState } from '../../ui/EmptyState';
import { DualViewTabs } from '../DualViewTabs';
import { LegacyModule } from '../LegacyModule';
import { LazyPaperTradingView, LazyResearchNotebookView } from '../LazyOwnerViews';
import { TodayPanel } from '../today/TodayPanel';
import { RadarView } from '../radar/RadarView';
import { WatchlistPanel } from '../../watchlist/WatchlistPanel';
import { MarketPulsePanel } from '../pulse/MarketPulsePanel';
import { WorldMarketsPanel } from '../world/WorldMarketsPanel';
import { WeatherPanel } from '../weather/WeatherPanel';
import { DriversPanel } from '../drivers/DriversPanel';
import { HedgeWizard } from '../hedge/HedgeWizard';
import { InstrumentOverview } from '../instrument/InstrumentOverview';
import { DomesticPricesPanel } from '../domestic/DomesticPricesPanel';

interface HubProps {
  tab?: string;
  sub?: string;
}

/** Prices: toggle between card view (commodity world) and table view (market watch). */
function PricesTab({ initial }: { initial: string }) {
  const t = useT();
  const [mode, setMode] = useState(initial);
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border border-white/10 overflow-hidden" role="group">
        {(['cards', 'table'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 text-xs ${mode === m ? 'bg-[var(--accent)]/20 text-[var(--text-strong)]' : 'text-[var(--text)]/70 hover:text-[var(--text-strong)]'}`}
          >
            {t(m === 'cards' ? 'n2.mk.viewCards' : 'n2.mk.viewTable')}
          </button>
        ))}
      </div>
      <LegacyModule id={mode === 'cards' ? 'commodity-world' : 'markets'} />
    </div>
  );
}

export function MarketHub({ tab, sub }: HubProps) {
  const t = useT();
  return (
    <DualViewTabs
      initialTabId={tab ?? 'today'}
      tabs={[
        { id: 'today', label: t('n2.mk.today'), note: t('n2.mk.todayNote'), render: () => <TodayPanel /> },
        {
          id: 'pulse',
          label: t('n2.mk.pulse'),
          note: t('n2.mk.pulseNote'),
          render: () => <MarketPulsePanel />,
        },
        { id: 'world', label: t('wd.tab'), note: t('wd.tabNote'), render: () => <WorldMarketsPanel /> },
        { id: 'weather', label: t('wx.tab'), note: t('wx.tabNote'), render: () => <WeatherPanel /> },
        { id: 'radar', label: t('n2.mk.radar'), note: t('n2.mk.radarNote'), render: () => <RadarView /> },
        { id: 'watchlist', label: t('wl.panel.title'), note: t('wl.panel.subtitle'), render: () => <WatchlistPanel /> },
        { id: 'domestic', label: t('dm.tab'), note: t('dm.tabNote'), render: () => <DomesticPricesPanel /> },
        { id: 'prices', label: t('n2.mk.prices'), note: t('n2.mk.pricesNote'), render: () => <PricesTab initial={sub ?? 'cards'} /> },
        { id: 'news', label: t('n2.mk.news'), note: t('n2.mk.newsNote'), render: () => <LegacyModule id="news" /> },
        { id: 'macro', label: t('n2.mk.macro'), note: t('n2.mk.macroNote'), render: () => <LegacyModule id="fundamental" /> },
      ]}
    />
  );
}

export function AnalysisHub({ tab }: HubProps) {
  const t = useT();
  const { openInstrumentIn } = useTerminal();
  return (
    <DualViewTabs
      initialTabId={tab ?? 'scorecard'}
      tabs={[
        {
          id: 'scorecard',
          label: t('n2.an.scorecard'),
          note: t('n2.an.scorecardNote'),
          render: () => <LegacyModule id="scorecard" onOpenInstrument={(s) => openInstrumentIn(s, 'instrument')} />,
        },
        { id: 'cycle', label: t('n2.an.cycle'), note: t('n2.an.cycleNote'), render: () => <LegacyModule id="cycle-hunter" /> },
        { id: 'report', label: t('n2.an.report'), note: t('n2.an.reportNote'), render: () => <LegacyModule id="research-report" /> },
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
          className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text-strong)]"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          {t('n2.in.back')}
        </button>
        <select
          aria-label={t('n2.in.pick')}
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1 text-sm text-[var(--text-strong)]"
        >
          {options.map((i) => (
            <option key={i.exchangeSymbol} value={i.exchangeSymbol}>
              {i.exchangeSymbol} · {i.productName}
            </option>
          ))}
        </select>
      </div>
      <DualViewTabs
        initialTabId={tab ?? 'overview'}
        tabs={[
          { id: 'overview', label: t('n2.in.overview'), note: '', render: () => <InstrumentOverview /> },
          { id: 'brief', label: t('brief.title'), note: '', render: () => <LegacyModule id="brief" /> },
          { id: 'charts', label: t('n2.in.charts'), note: '', render: () => <LegacyModule id="charts" /> },
          { id: 'cycle', label: t('n2.in.cycle'), note: t('n2.in.cycleNote'), render: () => <InstrumentCycleTab /> },
          { id: 'drivers', label: t('drv.tab'), note: t('drv.tabNote'), render: () => <DriversPanel /> },
          { id: 'cot', label: t('n2.in.cot'), note: '', render: () => <LegacyModule id="cot" /> },
          { id: 'profile', label: t('n2.in.profile'), note: '', render: () => <LegacyModule id="commodity-profile" /> },
          { id: 'ai', label: t('n2.in.ai'), note: '', render: () => <LegacyModule id="ai-analyst" /> },
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
        { id: 'risk', label: t('n2.me.risk'), note: '', render: () => <LegacyModule id="risk" /> },
        { id: 'hedge', label: t('hd.tab'), note: '', render: () => <HedgeWizard /> },
        { id: 'paper', label: t('n2.me.paper'), note: t('pt.disclaimer'), render: () => <LazyPaperTradingView /> },
      ]}
    />
  );
}
