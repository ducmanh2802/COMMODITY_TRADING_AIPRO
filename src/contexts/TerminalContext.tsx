import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { InstrumentDefinition, Timeframe, TradingStyle } from '../shared/types/instrument';
import type { DataQualityStatus, MarketQuote, MarketScope, ProviderHealth } from '../shared/types/market';
import type { AppModuleId, PhaseModuleDescriptor } from '../shared/types/risk';
import type { RoadmapPhase } from '../shared/architecture';

export interface BackendHealthPayload {
  status: string;
  service: string;
  phase: number;
  timestampUtc: string;
  timezone: string;
  localTimeLabel: string;
  runtime: {
    nodeVersion: string;
    environment: string;
  };
  capabilities: {
    geminiServerKeyConfigured: boolean;
    firebaseConfigured: boolean;
    marketDataProvidersTotal: number;
    marketDataProvidersConnected: number;
    marketDataOverallStatus: DataQualityStatus;
  };
}

export interface CandleDatasetSummary {
  symbol: string;
  exchange: string;
  timeframe: Timeframe;
  barCount: number;
  earliestTimestamp: string;
  latestTimestamp: string;
  importedAt: string;
  source: string;
  status: DataQualityStatus;
  warnings: string[];
}

export interface SyncOutcomeItem {
  providerId: string;
  providerName: string;
  status: string;
  candlesSynced: number;
  macroSynced: number;
  symbolsUpdated: string[];
  message: string;
  error?: string;
}

export interface SyncResultSummary {
  syncedAt: string;
  totalCandlesDatasetsAdded: number;
  totalMacroAdded: number;
  datasetsCount: number;
  macroRecordsCount: number;
  outcomes: SyncOutcomeItem[];
}

interface TerminalContextValue {
  activeModule: AppModuleId;
  setActiveModule: (module: AppModuleId) => void;
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;
  marketScope: MarketScope;
  setMarketScope: (scope: MarketScope) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  timeframe: Timeframe;
  setTimeframe: (tf: Timeframe) => void;
  tradingStyle: TradingStyle;
  setTradingStyle: (style: TradingStyle) => void;
  health: BackendHealthPayload | null;
  providers: ProviderHealth[];
  instruments: InstrumentDefinition[];
  quotesBySymbol: Record<string, MarketQuote>;
  datasets: CandleDatasetSummary[];
  modules: PhaseModuleDescriptor[];
  roadmap: RoadmapPhase[];
  loading: boolean;
  syncing: boolean;
  lastSyncSummary: SyncResultSummary | null;
  loadError: string | null;
  refreshBackendData: () => Promise<void>;
  syncProviderFeeds: (options?: { symbol?: string; timeframe?: Timeframe }) => Promise<SyncResultSummary | null>;
  openInstrumentIn: (symbol: string, module: AppModuleId) => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [activeModule, setActiveModule] = useState<AppModuleId>('overview');
  // Focus primarily on Vietnam MXV commodities by default (Cà phê Robusta · ICE:RC / MXV:LRC)
  const [selectedSymbol, setSelectedSymbol] = useState<string>('RC');
  const [marketScope, setMarketScope] = useState<MarketScope>('MXV');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState<Timeframe>('D1');
  const [tradingStyle, setTradingStyle] = useState<TradingStyle>('SWING');

  const [health, setHealth] = useState<BackendHealthPayload | null>(null);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [instruments, setInstruments] = useState<InstrumentDefinition[]>([]);
  const [quotesBySymbol, setQuotesBySymbol] = useState<Record<string, MarketQuote>>({});
  const [datasets, setDatasets] = useState<CandleDatasetSummary[]>([]);
  const [modules, setModules] = useState<PhaseModuleDescriptor[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState<SyncResultSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshBackendData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [healthRes, provRes, instRes, quotesRes, archRes, dsRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/providers/health'),
        fetch('/api/instruments'),
        fetch('/api/market/quotes'),
        fetch('/api/architecture'),
        fetch('/api/market/datasets'),
      ]);

      if (!healthRes.ok || !provRes.ok || !instRes.ok || !quotesRes.ok || !archRes.ok || !dsRes.ok) {
        throw new Error('Backend API returned non-200 status during terminal synchronization.');
      }

      const [healthJson, provJson, instJson, quotesJson, archJson, dsJson] = await Promise.all([
        healthRes.json(),
        provRes.json(),
        instRes.json(),
        quotesRes.json(),
        archRes.json(),
        dsRes.json(),
      ]);

      setHealth(healthJson);
      setProviders(provJson.providers ?? []);
      setInstruments(instJson.instruments ?? []);

      const quoteMap: Record<string, MarketQuote> = {};
      for (const q of (quotesJson.quotes ?? []) as MarketQuote[]) {
        quoteMap[q.symbol] = q;
      }
      setQuotesBySymbol(quoteMap);
      setDatasets(dsJson.datasets ?? []);
      setModules(archJson.modules ?? []);
      setRoadmap(archJson.roadmap ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to connect to backend API.');
    } finally {
      setLoading(false);
    }
  }, []);

  const syncProviderFeeds = useCallback(
    async (options?: { symbol?: string; timeframe?: Timeframe }): Promise<SyncResultSummary | null> => {
      setSyncing(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/providers/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: options?.symbol,
            timeframe: options?.timeframe ?? timeframe,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.message ?? 'Provider synchronization failed.');
        }
        setLastSyncSummary(json as SyncResultSummary);
        await refreshBackendData();
        return json as SyncResultSummary;
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Provider synchronization error.');
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [refreshBackendData, timeframe]
  );

  useEffect(() => {
    void refreshBackendData();
  }, [refreshBackendData]);

  const openInstrumentIn = useCallback((symbol: string, module: AppModuleId) => {
    setSelectedSymbol(symbol);
    setActiveModule(module);
  }, []);

  return (
    <TerminalContext.Provider
      value={{
        activeModule,
        setActiveModule,
        selectedSymbol,
        setSelectedSymbol,
        marketScope,
        setMarketScope,
        searchQuery,
        setSearchQuery,
        timeframe,
        setTimeframe,
        tradingStyle,
        setTradingStyle,
        health,
        providers,
        instruments,
        quotesBySymbol,
        datasets,
        modules,
        roadmap,
        loading,
        syncing,
        lastSyncSummary,
        loadError,
        refreshBackendData,
        syncProviderFeeds,
        openInstrumentIn,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) {
    throw new Error('useTerminal must be used inside TerminalProvider');
  }
  return ctx;
}
