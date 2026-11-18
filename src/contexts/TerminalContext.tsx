import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { InstrumentDefinition, Timeframe, TradingStyle } from '../shared/types/instrument';
import type { DataQualityStatus, MarketQuote, MarketScope, ProviderHealth } from '../shared/types/market';
import type { FullDataHealthReport } from '../shared/types/dataHealth';
import type { AppModuleId, PhaseModuleDescriptor } from '../shared/types/risk';
import type { RoadmapPhase } from '../shared/architecture';
import { safeReadJson } from '../shared/utils/http';

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
  dataHealthReport: FullDataHealthReport | null;
  modules: PhaseModuleDescriptor[];
  roadmap: RoadmapPhase[];
  loading: boolean;
  syncing: boolean;
  lastSyncSummary: SyncResultSummary | null;
  loadError: string | null;
  refreshBackendData: () => Promise<void>;
  syncProviderFeeds: (options?: {
    symbol?: string;
    timeframe?: Timeframe;
    historicalRange?: '1y' | '2y' | '5y' | '10y';
    includePublicMacro?: boolean;
  }) => Promise<SyncResultSummary | null>;
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
  const [dataHealthReport, setDataHealthReport] = useState<FullDataHealthReport | null>(null);
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
      // Each endpoint is loaded independently so one failing endpoint does not
      // blank the whole terminal; failures are reported by path + HTTP status.
      const endpoints = [
        '/api/health',
        '/api/providers/health',
        '/api/instruments',
        '/api/market/quotes',
        '/api/architecture',
        '/api/market/datasets',
        '/api/data/health-report',
      ] as const;
      const failures: string[] = [];
      const results = await Promise.all(
        endpoints.map(async (path) => {
          try {
            const res = await fetch(path);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return await safeReadJson<any>(res);
          } catch (err) {
            failures.push(`${path} → ${err instanceof Error ? err.message : 'network error'}`);
            return null;
          }
        })
      );
      const [healthJson, provJson, instJson, quotesJson, archJson, dsJson, reportJson] = results as [
        BackendHealthPayload | null,
        { providers?: ProviderHealth[] } | null,
        { instruments?: InstrumentDefinition[] } | null,
        { quotes?: MarketQuote[] } | null,
        { modules?: PhaseModuleDescriptor[]; roadmap?: RoadmapPhase[] } | null,
        { datasets?: CandleDatasetSummary[] } | null,
        FullDataHealthReport | null,
      ];

      if (healthJson) setHealth(healthJson);
      if (provJson) setProviders(provJson.providers ?? []);
      if (instJson) setInstruments(instJson.instruments ?? []);
      if (quotesJson) {
        const quoteMap: Record<string, MarketQuote> = {};
        for (const q of quotesJson.quotes ?? []) {
          quoteMap[q.symbol] = q;
        }
        setQuotesBySymbol(quoteMap);
      }
      if (dsJson) setDatasets(dsJson.datasets ?? []);
      if (reportJson && Array.isArray(reportJson.commodities)) setDataHealthReport(reportJson);
      if (archJson) {
        setModules(archJson.modules ?? []);
        setRoadmap(archJson.roadmap ?? []);
      }

      if (failures.length > 0) {
        throw new Error(`Backend sync partially failed: ${failures.join('; ')}`);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to connect to backend API.');
    } finally {
      setLoading(false);
    }
  }, []);

  const syncProviderFeeds = useCallback(
    async (options?: {
      symbol?: string;
      timeframe?: Timeframe;
      historicalRange?: '1y' | '2y' | '5y' | '10y';
      includePublicMacro?: boolean;
    }): Promise<SyncResultSummary | null> => {
      setSyncing(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/providers/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: options?.symbol,
            timeframe: options?.timeframe ?? timeframe,
            historicalRange: options?.historicalRange,
            includePublicMacro: options?.includePublicMacro ?? true,
          }),
        });
        const json = await safeReadJson<SyncResultSummary>(res);
        setLastSyncSummary(json);
        await refreshBackendData();
        return json;
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
        dataHealthReport,
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
