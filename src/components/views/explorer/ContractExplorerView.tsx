import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { ExchangeCode, InstrumentDefinition, ProductCategory } from '../../../shared/types/instrument';
import {
  errorMessage,
  fetchCalendarRule,
  fetchContractChain,
  type CalendarRuleResponse,
  type ContractChainResponse,
} from '../../../api/contractsApi';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { ContractChainTable } from './ContractChainTable';
import { TickCalculator } from './TickCalculator';
import { SourceLink, VerificationBadge } from './VerificationBadge';
import { fmtNum, useI18n, useT } from '../../../i18n';
import { InsightBox, ToolPurposeBanner } from '../../common/ToolGuideAndInsight';
import { interpretContractSpec } from '../../../shared/utils/advancedInsights';

type Filter<T> = 'ALL' | T;
type Loadable<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

const selectClass =
  'bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1.5 grid grid-cols-[150px_1fr] gap-3 border-b border-[var(--border)]/50 last:border-b-0">
      <dt className="text-[var(--text)]/55">{label}</dt>
      <dd className="text-[var(--text)] font-mono break-words min-w-0">{children}</dd>
    </div>
  );
}

function NullValue() {
  const t = useT();
  return <span className="text-[var(--warning)]">{t('exp.unavailable')}</span>;
}

function num(v: number | null, unit?: string): ReactNode {
  if (v === null) return <NullValue />;
  return (
    <span className="tabular-nums">
      {fmtNum(v)} {unit ? <span className="text-[var(--text)]/55">{unit}</span> : null}
    </span>
  );
}

export default function ContractExplorerView() {
  const { instruments, loading } = useTerminal();
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Filter<ProductCategory>>('ALL');
  const [exchange, setExchange] = useState<Filter<ExchangeCode>>('ALL');
  const [specStatus, setSpecStatus] = useState<Filter<string>>('ALL');
  const [mxvOnly, setMxvOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(todayUtc());
  const [count, setCount] = useState(8);
  const [chain, setChain] = useState<Loadable<ContractChainResponse>>({ state: 'idle' });
  const [rule, setRule] = useState<Loadable<CalendarRuleResponse>>({ state: 'idle' });

  const exchanges = useMemo(() => [...new Set(instruments.map((i) => i.exchange))].sort(), [instruments]);
  const categories = useMemo(() => [...new Set(instruments.map((i) => i.category))].sort(), [instruments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return instruments.filter((i) => {
      if (category !== 'ALL' && i.category !== category) return false;
      if (exchange !== 'ALL' && i.exchange !== exchange) return false;
      if (specStatus !== 'ALL' && i.specification.verificationStatus !== specStatus) return false;
      if (mxvOnly && !i.isMvxListed) return false;
      if (q) {
        const hay = `${i.id} ${i.productName} ${i.exchangeSymbol} ${i.mxvMapping?.mxvSymbol ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [instruments, query, category, exchange, specStatus, mxvOnly]);

  const selected: InstrumentDefinition | null =
    instruments.find((i) => i.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    const ctl = new AbortController();
    setRule({ state: 'loading' });
    fetchCalendarRule(selected.id, ctl.signal)
      .then((data) => setRule({ state: 'ok', data }))
      .catch((err) => {
        if (!ctl.signal.aborted) setRule({ state: 'error', message: errorMessage(err) });
      });
    return () => ctl.abort();
  }, [selected?.id]);

  useEffect(() => {
    if (!selected || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return;
    const ctl = new AbortController();
    setChain({ state: 'loading' });
    fetchContractChain(selected.id, { asOf, count }, ctl.signal)
      .then((data) => setChain({ state: 'ok', data }))
      .catch((err) => {
        if (!ctl.signal.aborted) setChain({ state: 'error', message: errorMessage(err) });
      });
    return () => ctl.abort();
  }, [selected?.id, asOf, count]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('exp.title')}</h2>
        <p className="text-sm text-[var(--text)]/65 mt-1">
          {t('exp.subtitle')}
        </p>
      </div>

      <ToolPurposeBanner toolKey="explorer" />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <label htmlFor="explorer-search" className="sr-only">
            {t('exp.searchLabel')}
          </label>
          <Search className="w-4 h-4 text-[var(--text)]/45 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            id="explorer-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('exp.searchPlaceholder')}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md pl-9 pr-3 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text)]/40 focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <select aria-label={t('exp.category')} value={category} onChange={(e) => setCategory(e.target.value as Filter<ProductCategory>)} className={selectClass}>
          <option value="ALL">{t('exp.allCategories')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>
        <select aria-label={t('common.exchange')} value={exchange} onChange={(e) => setExchange(e.target.value as Filter<ExchangeCode>)} className={selectClass}>
          <option value="ALL">{t('exp.allExchanges')}</option>
          {exchanges.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select aria-label={t('exp.specStatus')} value={specStatus} onChange={(e) => setSpecStatus(e.target.value)} className={selectClass}>
          <option value="ALL">{t('exp.anySpecStatus')}</option>
          <option value="VERIFIED">{t('verify.VERIFIED')} (VERIFIED)</option>
          <option value="UNVERIFIED">{t('verify.UNVERIFIED')} (UNVERIFIED)</option>
          <option value="UNAVAILABLE">{t('verify.UNAVAILABLE')} (UNAVAILABLE)</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text)]/75">
          <input type="checkbox" checked={mxvOnly} onChange={(e) => setMxvOnly(e.target.checked)} className="accent-[var(--accent)]" />
          {t('exp.mxvOnly')}
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 items-start">
        {/* Instrument list */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--border)] text-xs text-[var(--text)]/55 font-mono">
            {loading ? t('exp.loadingInstruments') : t('exp.instrumentsCount', { n: filtered.length, total: instruments.length })}
          </div>
          <ul className="max-h-[70vh] overflow-y-auto divide-y divide-[var(--border)]/60" aria-label={t('exp.instruments')}>
            {filtered.map((i) => {
              const active = selected?.id === i.id;
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(i.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                      active ? 'bg-[var(--accent)]/15 text-[var(--text-strong)]' : 'hover:bg-[var(--surface-2)]/60 text-[var(--text)]/85'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{i.productName}</span>
                      <span className="block font-mono text-[var(--text)]/55">
                        {i.exchange}:{i.exchangeSymbol}
                        {i.mxvMapping?.mxvSymbol ? ` · MXV ${i.mxvMapping.mxvSymbol}` : ''}
                      </span>
                    </span>
                    <VerificationBadge compact status={i.specification.verificationStatus} />
                  </button>
                </li>
              );
            })}
            {!loading && filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-[var(--text)]/55">{t('exp.noMatch')}</li>
            )}
          </ul>
        </div>

        {/* Detail */}
        {selected ? (
          <div className="space-y-4 min-w-0">
            <InsightBox insight={interpretContractSpec(selected, lang)} testId="exp-insight" />
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-base font-semibold text-[var(--text-strong)]">
                    {selected.productName} <span className="font-mono text-[var(--text)]/60">{selected.id}</span>
                  </h2>
                  <p className="text-xs text-[var(--text)]/55">
                    {selected.category.replace('_', ' ')} · {selected.exchange}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text)]/55">{t('exp.specification')}</span>
                  <VerificationBadge status={selected.specification.verificationStatus} />
                </div>
              </div>
              <dl className="text-xs">
                <Field label={t('term.contractSize')}>{num(selected.specification.contractSize, selected.specification.contractSizeUnit)}</Field>
                <Field label={t('exp.minimumTick')}>{num(selected.specification.minimumTickSize, selected.specification.quotationUnit)}</Field>
                <Field label={t('term.tickValue')}>{num(selected.specification.tickValue, selected.specification.tradingCurrency)}</Field>
                <Field label={t('exp.quotationUnit')}>{selected.specification.quotationUnit || <NullValue />}</Field>
                <Field label={t('exp.tradingCurrency')}>{selected.specification.tradingCurrency || <NullValue />}</Field>
                <Field label={t('exp.settlement')}>{selected.specification.settlementMethod}</Field>
                <Field label={t('exp.tradingHours')}>
                  <span className="font-sans">{selected.specification.tradingHoursSummary || <NullValue />}</span>{' '}
                  <span className="text-[var(--text)]/55">({selected.specification.tradingHoursTimezone})</span>
                </Field>
                <Field label={t('term.margin')}>
                  {selected.specification.marginRequirement === null ? (
                    <span className="text-[var(--warning)]">{t('exp.marginUnavailable')}</span>
                  ) : (
                    `${selected.specification.marginRequirement} ${selected.specification.marginCurrency ?? ''}`
                  )}
                </Field>
                <Field label={t('exp.dataSource')}>
                  <SourceLink href={selected.specification.dataSource} />
                </Field>
              </dl>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('exp.calendarRule')}</h2>
                  {rule.state === 'ok' && rule.data.rule && <VerificationBadge status={rule.data.rule.verificationStatus} />}
                </div>
                {rule.state === 'loading' || rule.state === 'idle' ? (
                  <p className="text-[var(--text)]/55">{t('common.loading')}</p>
                ) : rule.state === 'error' ? (
                  <p className="font-mono text-[var(--negative)]">{rule.message}</p>
                ) : !rule.data.rule ? (
                  <p className="font-mono text-[var(--warning)]">{t('exp.noCalendarRule')}</p>
                ) : (
                  <dl>
                    <Field label={t('exp.listedMonths')}>
                      <span className="font-sans">{rule.data.rule.listedMonths}</span>
                    </Field>
                    <Field label={t('term.lastTradingDay')}>
                      <span className="font-sans">{rule.data.rule.lastTradingDayRule}</span>
                    </Field>
                    {rule.data.rule.notes && (
                      <Field label={t('common.notes')}>
                        <span className="font-sans text-[var(--text)]/75">{rule.data.rule.notes}</span>
                      </Field>
                    )}
                    <Field label={t('common.source')}>
                      <SourceLink href={rule.data.rule.sourceUrl} />
                    </Field>
                  </dl>
                )}
              </section>

              <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('exp.mxvMapping')}</h2>
                  <VerificationBadge status={selected.mxvMapping?.mappingStatus ?? 'UNAVAILABLE'} />
                </div>
                {selected.mxvMapping ? (
                  <dl>
                    <Field label={t('exp.chain.mxvCode')}>{selected.mxvMapping.mxvSymbol ?? <NullValue />}</Field>
                    <Field label={t('exp.international')}>
                      {selected.mxvMapping.internationalExchange}:{selected.mxvMapping.internationalSymbol}
                    </Field>
                    <Field label={t('exp.mxvListedFlag')}>{selected.isMvxListed ? t('exp.yes') : t('exp.no')}</Field>
                    <Field label={t('common.notes')}>
                      <span className="font-sans text-[var(--text)]/75">{selected.mxvMapping.notes || '—'}</span>
                    </Field>
                  </dl>
                ) : (
                  <p className="font-mono text-[var(--warning)]">{t('exp.noMxvMapping')}</p>
                )}
              </section>
            </div>

            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('exp.contractChain')}</h2>
                  <p className="text-xs text-[var(--text)]/55">
                    {t('exp.from')} <span className="font-mono">GET /api/contracts/{selected.id}/chain</span>
                  </p>
                </div>
                <div className="flex items-end gap-2">
                  <label className="text-xs text-[var(--text)]/65 space-y-1">
                    <span className="block">{t('exp.asOf')}</span>
                    <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={selectClass} />
                  </label>
                  <label className="text-xs text-[var(--text)]/65 space-y-1">
                    <span className="block">{t('exp.tick.contracts')}</span>
                    <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={selectClass}>
                      {[4, 8, 12, 24, 36].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {chain.state === 'loading' || chain.state === 'idle' ? (
                <p className="text-xs text-[var(--text)]/55">{t('exp.loadingChain')}</p>
              ) : chain.state === 'error' ? (
                <div className="flex items-center gap-2 text-xs">
                  <DataStatusBadge status="UNAVAILABLE" />
                  <span className="font-mono text-[var(--negative)]">{chain.message}</span>
                </div>
              ) : (
                <ContractChainTable chain={chain.data} />
              )}
            </section>

            <TickCalculator key={selected.id} spec={selected.specification} />
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-xs text-[var(--text)]/55">
            {loading ? t('exp.loadingInstruments') : t('exp.selectInstrument')}
          </div>
        )}
      </div>
    </div>
  );
}
