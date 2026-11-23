import { useCallback, useEffect, useRef, useState } from 'react';
import type { FundamentalMacroRecord } from '../../../shared/types/analysis';
import type { DataQualityStatus } from '../../../shared/types/market';
import {
  parseFundamentalStreamPayload,
  type FundamentalNewsRecord,
} from '../today/fundamentalFeedUtils';

export type { FundamentalNewsRecord as NewsRecord };

export type FundamentalStreamState = 'CONNECTING' | 'LIVE' | 'POLLING' | 'ERROR';

const FALLBACK_POLL_MS = 30_000;

/**
 * Real-time loader for sourced fundamental macro & news records backed by fundamentalStore.
 * Connects to Server-Sent Events (/api/fundamental/stream) for immediate push updates
 * and falls back cleanly to REST polling (/api/fundamental/records) when unavailable.
 */
export function useFundamentalNews() {
  const [records, setRecords] = useState<FundamentalMacroRecord[]>([]);
  const [news, setNews] = useState<FundamentalNewsRecord[]>([]);
  const [status, setStatus] = useState<DataQualityStatus>('UNAVAILABLE');
  const [loading, setLoading] = useState(true);
  const [streamState, setStreamState] = useState<FundamentalStreamState>('CONNECTING');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const applyPayload = useCallback(
    (payload: {
      records?: FundamentalMacroRecord[];
      news?: FundamentalNewsRecord[];
      status?: DataQualityStatus;
      serverTime?: string;
    }) => {
      if (!mountedRef.current) return;
      const nextRecords = payload.records ?? [];
      const nextNews = payload.news ?? [];
      setRecords(nextRecords);
      setNews(nextNews);
      setStatus(
        payload.status ??
          (nextRecords.length > 0 || nextNews.length > 0 ? 'HISTORICAL' : 'UNAVAILABLE')
      );
      setLastUpdatedAt(payload.serverTime ?? new Date().toISOString());
      setError(null);
      setLoading(false);
    },
    []
  );

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/fundamental/records');
      if (!res.ok) {
        if (mountedRef.current) {
          setError(`HTTP ${res.status}`);
        }
        return;
      }
      const j = (await res.json()) as {
        records?: FundamentalMacroRecord[];
        news?: FundamentalNewsRecord[];
        status?: DataQualityStatus;
      };
      applyPayload({
        records: j.records,
        news: j.news,
        status: j.status,
      });
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Fetch failed');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [applyPayload]);

  useEffect(() => {
    mountedRef.current = true;
    void refetch();

    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      setStreamState('POLLING');
      const timer = window.setInterval(() => {
        void refetch();
      }, FALLBACK_POLL_MS);
      return () => {
        mountedRef.current = false;
        window.clearInterval(timer);
      };
    }

    let fallbackTimer: number | null = null;
    const ensureFallbackPolling = () => {
      if (fallbackTimer !== null) return;
      fallbackTimer = window.setInterval(() => {
        void refetch();
      }, FALLBACK_POLL_MS);
    };
    const clearFallbackPolling = () => {
      if (fallbackTimer !== null) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const es = new window.EventSource('/api/fundamental/stream');

    const handleStreamEvent = (rawEvent: Event) => {
      const msg = rawEvent as MessageEvent<string>;
      const parsed = parseFundamentalStreamPayload(msg.data);
      if (!parsed) return;
      clearFallbackPolling();
      setStreamState('LIVE');
      applyPayload(parsed);
    };

    es.onopen = () => {
      if (!mountedRef.current) return;
      clearFallbackPolling();
      setStreamState('LIVE');
      setError(null);
    };

    es.addEventListener('snapshot', handleStreamEvent);
    es.addEventListener('update', handleStreamEvent);

    es.onerror = () => {
      if (!mountedRef.current) return;
      setStreamState(es.readyState === window.EventSource.CLOSED ? 'ERROR' : 'POLLING');
      ensureFallbackPolling();
    };

    return () => {
      mountedRef.current = false;
      clearFallbackPolling();
      es.removeEventListener('snapshot', handleStreamEvent);
      es.removeEventListener('update', handleStreamEvent);
      es.close();
    };
  }, [applyPayload, refetch]);

  return {
    records,
    news,
    status,
    loading,
    streamState,
    lastUpdatedAt,
    error,
    refetch,
  };
}
