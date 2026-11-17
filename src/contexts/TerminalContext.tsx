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

interface TerminalContextValue {
  activeModule: AppModuleId;
  setActiveModule: (module: AppModuleId) => void;
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
  modules: PhaseModuleDescriptor[];
  roadmap: RoadmapPhase[];
  loading: boolean;
  loadError: string | null;
  refreshBackendData: () => Promise<void>;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [activeModule, setActiveModule] = useState<AppModuleId>('overview');
  const [marketScope, setMarketScope] = useState<MarketScope>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState<Timeframe>('H4');
  const [tradingStyle, setTradingStyle] = useState<TradingStyle>('SWING');

  const [health, setHealth] = useState<BackendHealthPayload | null>(null);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [instruments, setInstruments] = useState<InstrumentDefinition[]>([]);
  const [quotesBySymbol, setQuotesBySymbol] = useState<Record<string, MarketQuote>>({});
  const [modules, setModules] = useState<PhaseModuleDescriptor[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshBackendData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [healthRes, provRes, instRes, quotesRes, archRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/providers/health'),
        fetch('/api/instruments'),
        fetch('/api/market/quotes'),
        fetch('/api/architecture'),
      ]);

      if (!healthRes.ok || !provRes.ok || !instRes.ok || !quotesRes.ok || !archRes.ok) {
        throw new Error('Backend API returned non-200 status during terminal synchronization.');
      }

      const [healthJson, provJson, instJson, quotesJson, archJson] = await Promise.all([
        healthRes.json(),
        provRes.json(),
        instRes.json(),
        quotesRes.json(),
        archRes.json(),
      ]);

      setHealth(healthJson);
      setProviders(provJson.providers ?? []);
      setInstruments(instJson.instruments ?? []);

      const quoteMap: Record<string, MarketQuote> = {};
      for (const q of (quotesJson.quotes ?? []) as MarketQuote[]) {
        quoteMap[q.symbol] = q;
      }
      setQuotesBySymbol(quoteMap);
      setModules(archJson.modules ?? []);
      setRoadmap(archJson.roadmap ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to connect to backend API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBackendData();
  }, [refreshBackendData]);

  return (
    <TerminalContext.Provider
      value={{
        activeModule,
        setActiveModule,
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
        modules,
        roadmap,
        loading,
        loadError,
        refreshBackendData,
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
