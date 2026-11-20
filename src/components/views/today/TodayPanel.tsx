import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useI18n } from '../../../i18n';
import type { CycleMarketOverview } from '../../../shared/types/cycle';
import type { ScorecardListResponse } from '../../../shared/types/scorecard';
import type { TodayResponse } from '../../../shared/types/today';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
import { buildVietnamEconomicCalendar } from '../../../shared/utils/vietnamCalendar';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { Skeleton } from '../../ui/Skeleton';

interface TodayItem {
  key: string;
  text: string;
  symbol: string | null;
}
interface TodaySection {
  id: string;
  title: string;
  items: TodayItem[];
}

/** "Hôm nay nên chú ý gì": neutral, plain-language pointers built only from existing endpoints. */
export function TodayPanel() {
  const { t, lang } = useI18n();
  const { openInstrumentIn } = useTerminal();
  const [score, setScore] = useState<ScorecardListResponse | null>(null);
  const [cycle, setCycle] = useState<CycleMarketOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    // One round-trip: the server serves scorecard + cycle overview from a stale-while-revalidate cache.
    void fetchJsonWithRetry<TodayResponse>('/api/today', { signal: ctrl.signal })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setScore(r.scorecard);
        setCycle(r.cycle);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const sections = useMemo<TodaySection[]>(() => {
    const out: TodaySection[] = [];
    const cards = score?.scorecards ?? [];
    const names = new Map<string, string>();
    for (const c of cards) names.set(c.exchangeSymbol, (lang === 'vi' && c.vietnameseName) || c.productName);
    const nameOf = (sym: string, fallback?: string) => names.get(sym) ?? fallback ?? sym;

    const moves = cards
      .filter((c) => c.price.changePct !== null && Math.abs(c.price.changePct) >= 0.005)
      .sort((a, b) => Math.abs(b.price.changePct ?? 0) - Math.abs(a.price.changePct ?? 0))
      .slice(0, 3)
      .map((c) => ({
        key: `mv-${c.exchangeSymbol}`,
        symbol: c.exchangeSymbol,
        text: t('n2.td.move', {
          name: nameOf(c.exchangeSymbol),
          dir: t((c.price.changePct ?? 0) >= 0 ? 'n2.td.up' : 'n2.td.down'),
          pct: Math.abs((c.price.changePct ?? 0) * 100).toFixed(2),
        }),
      }));
    if (moves.length) out.push({ id: 'moves', title: t('n2.td.sec.moves'), items: moves });

    const seen = new Set<string>();
    const cycleItems: TodayItem[] = [];
    for (const c of cycle?.commodities ?? []) {
      const sym = c.instrument.exchangeSymbol;
      if (seen.has(sym)) continue;
      const key =
        c.cyclePhase === 'PHASE_2_EARLY_RECOVERY' ? 'n2.td.phase2' : c.cyclePhase === 'PHASE_4_DISTRIBUTION' ? 'n2.td.phase4' : null;
      if (!key) continue;
      seen.add(sym);
      cycleItems.push({ key: `cy-${sym}`, symbol: sym, text: t(key, { name: nameOf(sym, c.instrument.productName) }) });
    }
    if (cycleItems.length) out.push({ id: 'cycle', title: t('n2.td.sec.cycle'), items: cycleItems.slice(0, 6) });

    const trendItems: TodayItem[] = cards
      .filter((c) => c.overall.trendClarity.level === 'CLEAR')
      .sort((a, b) => (b.overall.trendClarity.score ?? 0) - (a.overall.trendClarity.score ?? 0))
      .slice(0, 3)
      .map((c) => ({
        key: `tr-${c.exchangeSymbol}`,
        symbol: c.exchangeSymbol,
        text: t('n2.td.clear', { name: nameOf(c.exchangeSymbol), score: c.overall.trendClarity.score ?? 0 }),
      }));
    for (const c of cards.filter((x) => x.overall.volatilityRisk.level === 'HIGH').slice(0, 3)) {
      trendItems.push({ key: `vol-${c.exchangeSymbol}`, symbol: c.exchangeSymbol, text: t('n2.td.volHigh', { name: nameOf(c.exchangeSymbol) }) });
    }
    if (trendItems.length) out.push({ id: 'trend', title: t('n2.td.sec.trend'), items: trendItems });

    const events = buildVietnamEconomicCalendar(new Date(), 7)
      .filter((e) => e.type === 'MACRO_RELEASE')
      .sort((a, b) => a.ictIsoTimestamp.localeCompare(b.ictIsoTimestamp))
      .slice(0, 5)
      .map((e) => ({
        key: `ev-${e.id}`,
        symbol: e.relatedSymbols[0] ?? null,
        text: t('n2.td.report', {
          date: `${e.dateIso.slice(8, 10)}/${e.dateIso.slice(5, 7)}`,
          time: e.ictTimeLabel,
          title: lang === 'vi' ? e.titleVi : e.titleEn,
        }),
      }));
    if (events.length) out.push({ id: 'reports', title: t('n2.td.sec.reports'), items: events });

    const quality = new Map<string, TodayItem>();
    for (const c of cycle?.commodities ?? []) {
      const sym = c.instrument.exchangeSymbol;
      const bad = c.dataStatus === 'STALE' ? 'n2.td.stale' : c.dataStatus === 'UNAVAILABLE' || c.quote.price === null ? 'n2.td.noPrice' : null;
      if (bad) quality.set(sym, { key: `q-${sym}`, symbol: sym, text: t(bad, { name: nameOf(sym, c.instrument.productName) }) });
    }
    for (const c of cards) {
      const bad = c.price.status === 'STALE' ? 'n2.td.stale' : c.price.status === 'UNAVAILABLE' ? 'n2.td.noPrice' : null;
      if (bad) quality.set(c.exchangeSymbol, { key: `q-${c.exchangeSymbol}`, symbol: c.exchangeSymbol, text: t(bad, { name: nameOf(c.exchangeSymbol) }) });
    }
    if (quality.size) out.push({ id: 'quality', title: t('n2.td.sec.quality'), items: [...quality.values()].slice(0, 8) });
    return out;
  }, [score, cycle, lang, t]);

  let body: ReactNode;
  if (loading)
    body = (
      <div className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label={t('n2.td.loading')}>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-1/3 mb-3" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </Card>
        ))}
      </div>
    );
  else if (sections.length === 0) body = <EmptyState icon={<Sparkles className="w-5 h-5" aria-hidden="true" />} title={t('n2.td.empty')} />;
  else
    body = (
      <div className="grid gap-3 md:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.id} as="section" aria-label={s.title}>
            <h3 className="text-sm font-semibold text-[var(--text-strong)] mb-2">{s.title}</h3>
            <ul className="space-y-1">
              {s.items.map((it) => (
                <li key={it.key}>
                  {it.symbol ? (
                    <button
                      type="button"
                      title={t('n2.td.open')}
                      onClick={() => openInstrumentIn(it.symbol as string, 'instrument')}
                      className="w-full flex items-center justify-between gap-2 text-left text-sm text-[var(--text)] rounded-md px-2 py-1.5 hover:bg-[var(--surface-2)]"
                    >
                      <span>{it.text}</span>
                      <ChevronRight className="w-4 h-4 shrink-0 text-[var(--faint)]" aria-hidden="true" />
                    </button>
                  ) : (
                    <p className="text-sm text-[var(--text)] px-2 py-1.5">{it.text}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    );

  return (
    <div className="space-y-3">
      <SectionHeader title={t('n2.td.title')} subtitle={t('n2.td.disclaimer')} />
      {body}
    </div>
  );
}
