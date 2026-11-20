import { useEffect, useState } from 'react';
import type { TodayResponse } from '../../../shared/types/today';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
import type { UsdVnd } from './model';

interface FxItem {
  id: string;
  value: number | null;
  asOf: string | null;
  status: string;
}

const REFRESH_MS = 5 * 60_000;

/** /api/today (scorecards + cycle) and the Vietcombank USD/VND rate (/api/macro/fx). Both optional; failures degrade to null. */
export function useSimpleData(): { today: TodayResponse | null; fx: UsdVnd | null; loading: boolean } {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [fx, setFx] = useState<UsdVnd | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    const load = async () => {
      const [t, f] = await Promise.all([
        fetchJsonWithRetry<TodayResponse>('/api/today', { signal: ctrl.signal }).catch(() => null),
        fetchJsonWithRetry<{ items?: FxItem[] }>('/api/macro/fx', { signal: ctrl.signal }).catch(() => null),
      ]);
      if (ctrl.signal.aborted) return;
      if (t) setToday(t);
      const vcb = f?.items?.find((i) => i.id === 'USDVND_VCB');
      if (vcb && vcb.value !== null && Number.isFinite(vcb.value) && vcb.status !== 'UNAVAILABLE') {
        setFx({ rate: vcb.value, asOf: vcb.asOf });
      }
      setLoading(false);
    };
    void load();
    const id = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, []);

  return { today, fx, loading };
}
