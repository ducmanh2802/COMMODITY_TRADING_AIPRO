import { useCallback, useEffect, useState } from 'react';
import type { FundamentalMacroRecord, MarketDirection } from '../../../shared/types/analysis';
import type { DataQualityStatus } from '../../../shared/types/market';

export interface NewsRecord {
  id: string;
  headline: string;
  source: string;
  publicationTimestamp: string;
  category: string;
  relatedSymbols: string[];
  classification: MarketDirection;
  summary: string;
}

/** Single loader for /api/fundamental/records, shared by NewsFeed, MacroPanel and CalendarPanel. */
export function useFundamentalNews() {
  const [records, setRecords] = useState<FundamentalMacroRecord[]>([]);
  const [news, setNews] = useState<NewsRecord[]>([]);
  const [status, setStatus] = useState<DataQualityStatus>('UNAVAILABLE');
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fundamental/records');
      if (res.ok) {
        const j = await res.json();
        setRecords(j.records ?? []);
        setNews(j.news ?? []);
        setStatus(j.status ?? 'UNAVAILABLE');
      }
    } catch {
      /* keep previous state; status stays as is */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { records, news, status, loading, refetch };
}
