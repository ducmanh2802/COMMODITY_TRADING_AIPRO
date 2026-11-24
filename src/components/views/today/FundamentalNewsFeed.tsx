import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CloudDownload,
  HelpCircle,
  Minus,
  Newspaper,
  Radio,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useI18n, useT } from '../../../i18n';
import type { MarketDirection } from '../../../shared/types/analysis';
import { formatTimestampInZone, VIETNAM_TIMEZONE } from '../../../shared/utils/time';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import {
  changeText,
  datasetName,
  periodLabel,
  sourceLabel,
  unitWords,
  valueText,
} from '../../common/macroRecordFormat';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { useFundamentalNews, type FundamentalStreamState } from '../news/useFundamentalNews';
import {
  buildFundamentalFeedEntries,
  summarizeFundamentalFeed,
  type FundamentalFeedDirectionFilter,
  type FundamentalFeedEntry,
  type FundamentalFeedKindFilter,
} from './fundamentalFeedUtils';

const INITIAL_LIMIT = 6;
const SUMMARY_COLLAPSE_THRESHOLD = 160;

function DirectionIndicator({ direction, label }: { direction: MarketDirection; label: string }) {
  if (direction === 'BULLISH') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--positive)] whitespace-nowrap shrink-0">
        <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (direction === 'BEARISH') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--negative)] whitespace-nowrap shrink-0">
        <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (direction === 'SIDEWAYS') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] whitespace-nowrap shrink-0">
        <Minus className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] whitespace-nowrap shrink-0">
      <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function StreamTelemetry({
  state,
  label,
}: {
  state: FundamentalStreamState;
  label: string;
}) {
  const toneCls =
    state === 'LIVE'
      ? 'text-[var(--positive)]'
      : state === 'ERROR'
        ? 'text-[var(--warning)]'
        : 'text-[var(--muted)]';

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${toneCls}`}>
      {state === 'LIVE' ? (
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--positive)] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--positive)]" />
        </span>
      ) : (
        <Radio className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

/**
 * Real-time dashboard news feed powered by fundamentalStore (/api/fundamental/stream & /api/fundamental/records).
 * Displays verified market news records and macro releases with zero fabricated content.
 */
export function FundamentalNewsFeed() {
  const { t } = useI18n();
  const {
    selectedSymbol,
    openInstrumentIn,
    setActiveModule,
    syncProviderFeeds,
    syncing,
    timeframe,
  } = useTerminal();

  const { records, news, status, loading, streamState, lastUpdatedAt, error, refetch } =
    useFundamentalNews();

  const [kindFilter, setKindFilter] = useState<FundamentalFeedKindFilter>('ALL');
  const [directionFilter, setDirectionFilter] = useState<FundamentalFeedDirectionFilter>('ALL');
  const [symbolOnly, setSymbolOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const summary = useMemo(() => summarizeFundamentalFeed(records, news), [records, news]);

  const entries = useMemo(
    () =>
      buildFundamentalFeedEntries(records, news, {
        kindFilter,
        directionFilter,
        symbolFilter: symbolOnly ? selectedSymbol : null,
        query,
      }),
    [records, news, kindFilter, directionFilter, symbolOnly, selectedSymbol, query]
  );

  const visibleEntries = showAll ? entries : entries.slice(0, INITIAL_LIMIT);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleSyncMacro = async () => {
    await syncProviderFeeds({ timeframe, includePublicMacro: true });
    await refetch();
  };

  const toggleExpand = (key: string) => {
    setExpandedIds((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetFilters = () => {
    setKindFilter('ALL');
    setDirectionFilter('ALL');
    setSymbolOnly(false);
    setQuery('');
  };

  const hasActiveFilters =
    kindFilter !== 'ALL' || directionFilter !== 'ALL' || symbolOnly || query.trim().length > 0;

  return (
    <Card
      as="section"
      padded={false}
      aria-label={t('n2.td.feed.title')}
      data-testid="fundamental-news-feed"
      className="overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[var(--border)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold text-[var(--text-strong)] inline-flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
              <span>{t('n2.td.feed.title')}</span>
            </h3>
            <StreamTelemetry
              state={streamState}
              label={t(`n2.td.feed.stream.${streamState}`)}
            />
            <DataStatusBadge status={status} compact />
          </div>
          <p className="text-xs text-[var(--muted)] mt-1">{t('n2.td.feed.hint')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {lastUpdatedAt && (
            <span className="text-xs text-[var(--muted)] tabular-nums whitespace-nowrap mr-1">
              {t('n2.td.feed.lastPush', {
                time: formatTimestampInZone(lastUpdatedAt, VIETNAM_TIMEZONE),
              })}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--border)] bg-[var(--bg)] text-xs font-medium text-[var(--text)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{t('n2.td.feed.refresh')}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleSyncMacro()}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--border)] bg-[var(--bg)] text-xs font-medium text-[var(--text)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
          >
            <CloudDownload className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span>{syncing ? t('news.syncing') : t('n2.td.feed.syncMacro')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('news-hub')}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs font-medium text-[var(--accent-text)] hover:underline whitespace-nowrap shrink-0"
          >
            <span>{t('n2.td.feed.openHub')}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg)]/40 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label={t('n2.td.feed.title')}
            className="inline-flex items-center gap-1 p-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]"
          >
            {(
              [
                { id: 'ALL', count: summary.total },
                { id: 'NEWS', count: summary.newsCount },
                { id: 'MACRO', count: summary.macroCount },
              ] as const
            ).map((tab) => {
              const active = kindFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setKindFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md tabular-nums whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
                  }`}
                >
                  {t(`n2.td.feed.kind.${tab.id}`, { n: tab.count })}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-pressed={symbolOnly}
            onClick={() => setSymbolOnly((v) => !v)}
            className={`h-8 px-3 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              symbolOnly
                ? 'bg-[var(--accent-soft)] border-[var(--accent)]/50 text-[var(--accent-text)]'
                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text-strong)]'
            }`}
          >
            {t('n2.td.feed.symbolFocus', { symbol: selectedSymbol })}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t('n2.td.feed.dirFilter')}
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value as FundamentalFeedDirectionFilter)}
            className="h-8 bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 text-xs text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="ALL">{t('n2.td.feed.dirAll')}</option>
            <option value="BULLISH">{t('news.dir.BULLISH')}</option>
            <option value="BEARISH">{t('news.dir.BEARISH')}</option>
            <option value="SIDEWAYS">{t('news.dir.SIDEWAYS')}</option>
            <option value="UNCERTAIN">{t('news.dir.UNCERTAIN')}</option>
          </select>

          <div className="relative">
            <label htmlFor="dashboard-feed-search" className="sr-only">
              {t('n2.td.feed.searchAria')}
            </label>
            <Search
              className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="dashboard-feed-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('n2.td.feed.searchPlaceholder')}
              className="h-8 w-48 sm:w-56 bg-[var(--surface)] border border-[var(--border)] rounded-md pl-8 pr-2.5 text-xs text-[var(--text-strong)] placeholder:text-[var(--faint)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      {error && summary.total === 0 && !loading && (
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--negative)]/10 text-xs text-[var(--negative)] flex items-center justify-between gap-2">
          <span>{t('n2.td.feed.loadError')}</span>
          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            className="underline font-medium whitespace-nowrap"
          >
            {t('n2.td.feed.refresh')}
          </button>
        </div>
      )}

      {loading && summary.total === 0 ? (
        <div className="p-4 space-y-3" role="status" aria-busy="true" aria-label={t('news.list.loading')}>
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : summary.total === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<Newspaper className="w-5 h-5" aria-hidden="true" />}
            title={t('n2.td.feed.emptyTitle')}
            description={t('n2.td.feed.emptyBody')}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSyncMacro()}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
                >
                  <CloudDownload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{syncing ? t('news.syncing') : t('n2.td.feed.syncMacro')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModule('news-hub')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-strong)] text-xs font-medium rounded-md"
                >
                  <span>{t('n2.td.feed.openHub')}</span>
                </button>
              </div>
            }
          />
        </div>
      ) : entries.length === 0 ? (
        <div className="p-6 text-center space-y-2">
          <p className="text-sm text-[var(--muted)]">{t('n2.td.feed.filterEmpty')}</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center px-3 py-1.5 rounded-md border border-[var(--border)] text-xs font-medium text-[var(--text-strong)] hover:bg-[var(--surface-2)]"
            >
              {t('n2.td.feed.resetFilters')}
            </button>
          )}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border)]/70">
            {visibleEntries.map((item) => (
              <FeedRow
                key={item.key}
                item={item}
                expanded={Boolean(expandedIds[item.key])}
                onToggleExpand={() => toggleExpand(item.key)}
                onOpenSymbol={(sym) => openInstrumentIn(sym, 'instrument')}
              />
            ))}
          </ul>

          {entries.length > INITIAL_LIMIT && (
            <div className="px-4 py-2.5 border-t border-[var(--border)] flex items-center justify-between gap-2 bg-[var(--bg)]/30">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                {showAll
                  ? t('n2.td.feed.showFewer')
                  : t('n2.td.feed.showAll', { n: entries.length })}
              </button>
              <button
                type="button"
                onClick={() => setActiveModule('news-hub')}
                className="text-xs text-[var(--muted)] hover:text-[var(--text-strong)] hover:underline"
              >
                {t('n2.td.feed.openHub')} →
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function FeedRow({
  item,
  expanded,
  onToggleExpand,
  onOpenSymbol,
}: {
  item: FundamentalFeedEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenSymbol: (symbol: string) => void;
}) {
  const t = useT();
  const displayTitle =
    item.entryType === 'MACRO' ? datasetName(t, item.title) : item.title;
  const displaySource = item.macroRecord
    ? sourceLabel(item.macroRecord)
    : item.source;
  const pubTime = formatTimestampInZone(item.publicationTimestamp, VIETNAM_TIMEZONE);
  const macro = item.macroRecord;
  const change = macro ? changeText(t, macro) : null;
  const longSummary = Boolean(item.summary && item.summary.length > SUMMARY_COLLAPSE_THRESHOLD);

  return (
    <li className="px-4 py-3 space-y-1.5 hover:bg-[var(--surface-2)]/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--text-strong)] leading-snug min-w-0">
          {displayTitle}
        </p>
        <DirectionIndicator
          direction={item.direction}
          label={t(`news.dir.${item.direction}`)}
        />
      </div>

      {/* Zero-pill inline metadata line */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--muted)] tabular-nums">
        <span>{t(`n2.td.feed.type.${item.entryType}`)}</span>
        <span aria-hidden="true">·</span>
        <span>{displaySource}</span>
        <span aria-hidden="true">·</span>
        <span>{pubTime}</span>
        {item.relatedSymbols.length > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {item.relatedSymbols.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => onOpenSymbol(sym)}
                  className="font-mono font-medium text-[var(--accent-text)] hover:underline"
                >
                  {sym}
                </button>
              ))}
            </span>
          </>
        )}
      </div>

      {item.entryType === 'NEWS' && item.summary && (
        <div className="text-xs text-[var(--text)]/85 leading-relaxed">
          <p className={!expanded && longSummary ? 'line-clamp-2' : ''}>{item.summary}</p>
          {longSummary && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={onToggleExpand}
              className="mt-1 text-xs font-medium text-[var(--accent-text)] hover:underline"
            >
              {expanded ? t('n2.td.feed.readLess') : t('n2.td.feed.readMore')}
            </button>
          )}
        </div>
      )}

      {macro && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-[var(--text)]">
          <span className="font-semibold text-[var(--text-strong)]">
            {valueText(t, macro.actualValue)} {unitWords(t, macro.unit)}
          </span>
          {change && <span className="text-[var(--muted)]">{change}</span>}
          <span className="text-[var(--muted)]">{periodLabel(t, macro)}</span>
        </div>
      )}
    </li>
  );
}
