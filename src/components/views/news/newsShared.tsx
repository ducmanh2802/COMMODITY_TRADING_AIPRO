import { useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import { formatTimestampInZone } from '../../../shared/utils/time';

export type NewsImpact = 'CAO' | 'TRUNG BÌNH' | 'THẤP';

export interface TaggedNewsItem {
  id: string;
  title: string;
  snippet: string;
  link: string | null;
  source: string;
  publishedAt: string;
  instruments: string[];
  impact: NewsImpact;
  summaryVi: string | null;
}

export interface TaggedNewsResponse {
  retrievedAt: string;
  aiSummaries: boolean;
  items: TaggedNewsItem[];
}

const IMPACT_CLASS: Record<NewsImpact, string> = {
  CAO: 'border-[var(--negative)] text-[var(--negative)]',
  'TRUNG BÌNH': 'border-[var(--warning)] text-[var(--warning)]',
  THẤP: 'border-[var(--border)] text-[var(--muted)]',
};

export function ImpactBadge({ impact }: { impact: NewsImpact }) {
  const t = useT();
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${IMPACT_CLASS[impact]}`}>
      {t(`nw.impact.${impact}`)}
    </span>
  );
}

export function newsTime(iso: string): string {
  return formatTimestampInZone(iso, 'Asia/Ho_Chi_Minh');
}

export type NewsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; data: TaggedNewsResponse };

/** Fetches /api/news (optionally filtered server-side by instrument). */
export function useTaggedNews(instrument: string | null, limit: number): NewsState {
  const [state, setState] = useState<NewsState>({ status: 'loading' });
  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    const qs = new URLSearchParams({ limit: String(limit) });
    if (instrument) qs.set('instrument', instrument);
    fetch(`/api/news?${qs.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<TaggedNewsResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => setState({ status: 'ok', data }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: 'error' });
      });
    return () => ctrl.abort();
  }, [instrument, limit]);
  return state;
}
