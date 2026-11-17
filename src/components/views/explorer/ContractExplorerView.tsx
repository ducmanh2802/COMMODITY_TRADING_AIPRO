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

type Filter<T> = 'ALL' | T;
type Loadable<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

const selectClass =
  'bg-[#111622] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs text-[#E5E7EB] focus:outline-none focus:border-[#6366F1]';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1.5 grid grid-cols-[150px_1fr] gap-3 border-b border-[#263244]/50 last:border-b-0">
      <dt className="text-[#E5E7EB]/55">{label}</dt>
      <dd className="text-[#E5E7EB] font-mono break-words min-w-0">{children}</dd>
    </div>
  );
}

function NullValue() {
  return <span className="text-[#F59E0B]">UNAVAILABLE</span>;
}

function num(v: number | null, unit?: string): ReactNode {
  if (v === null) return <NullValue />;
  return (
    <span className="tabular-nums">
      {v} {unit ? <span className="text-[#E5E7EB]/55">{unit}</span> : null}
    </span>
  );
}

export default function ContractExplorerView() {
  const { instruments, loading } = useTerminal();
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
        <h1 className="text-xl font-semibold text-white tracking-tight">Contract Explorer</h1>
        <p className="text-sm text-[#E5E7EB]/65 mt-1">
          Instrument Master specifications, expiry calendars and MXV ↔ international mapping. Unverified values are flagged, never filled in.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <label htmlFor="explorer-search" className="sr-only">
            Search instruments
          </label>
          <Search className="w-4 h-4 text-[#E5E7EB]/45 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            id="explorer-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Symbol, product, MXV code..."
            className="w-full bg-[#111622] border border-[#263244] rounded-md pl-9 pr-3 py-1.5 text-xs text-[#E5E7EB] placeholder:text-[#E5E7EB]/40 focus:outline-none focus:border-[#6366F1]"
          />
        </div>
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as Filter<ProductCategory>)} className={selectClass}>
          <option value="ALL">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>
        <select aria-label="Exchange" value={exchange} onChange={(e) => setExchange(e.target.value as Filter<ExchangeCode>)} className={selectClass}>
          <option value="ALL">All exchanges</option>
          {exchanges.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select aria-label="Spec status" value={specStatus} onChange={(e) => setSpecStatus(e.target.value)} className={selectClass}>
          <option value="ALL">Any spec status</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="UNVERIFIED">UNVERIFIED</option>
          <option value="UNAVAILABLE">UNAVAILABLE</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-[#E5E7EB]/75">
          <input type="checkbox" checked={mxvOnly} onChange={(e) => setMxvOnly(e.target.checked)} className="accent-[#6366F1]" />
          MXV-listed only
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 items-start">
        {/* Instrument list */}
        <div className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-[#263244] text-xs text-[#E5E7EB]/55 font-mono">
            {loading ? 'Loading instruments...' : `${filtered.length} / ${instruments.length} instruments`}
          </div>
          <ul className="max-h-[70vh] overflow-y-auto divide-y divide-[#263244]/60" aria-label="Instruments">
            {filtered.map((i) => {
              const active = selected?.id === i.id;
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(i.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                      active ? 'bg-[#6366F1]/15 text-white' : 'hover:bg-[#172033]/60 text-[#E5E7EB]/85'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{i.productName}</span>
                      <span className="block font-mono text-[#E5E7EB]/55">
                        {i.exchange}:{i.exchangeSymbol}
                        {i.mxvMapping?.mxvSymbol ? ` · MXV ${i.mxvMapping.mxvSymbol}` : ''}
                      </span>
                    </span>
                    <VerificationBadge status={i.specification.verificationStatus} />
                  </button>
                </li>
              );
            })}
            {!loading && filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-[#E5E7EB]/55">No instruments match the filters.</li>
            )}
          </ul>
        </div>

        {/* Detail */}
        {selected ? (
          <div className="space-y-4 min-w-0">
            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {selected.productName} <span className="font-mono text-[#E5E7EB]/60">{selected.id}</span>
                  </h2>
                  <p className="text-xs text-[#E5E7EB]/55">
                    {selected.category.replace('_', ' ')} · {selected.exchange}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#E5E7EB]/55">Specification</span>
                  <VerificationBadge status={selected.specification.verificationStatus} />
                </div>
              </div>
              <dl className="text-xs">
                <Field label="Contract size">{num(selected.specification.contractSize, selected.specification.contractSizeUnit)}</Field>
                <Field label="Minimum tick">{num(selected.specification.minimumTickSize, selected.specification.quotationUnit)}</Field>
                <Field label="Tick value">{num(selected.specification.tickValue, selected.specification.tradingCurrency)}</Field>
                <Field label="Quotation unit">{selected.specification.quotationUnit || <NullValue />}</Field>
                <Field label="Trading currency">{selected.specification.tradingCurrency || <NullValue />}</Field>
                <Field label="Settlement">{selected.specification.settlementMethod}</Field>
                <Field label="Trading hours">
                  <span className="font-sans">{selected.specification.tradingHoursSummary || <NullValue />}</span>{' '}
                  <span className="text-[#E5E7EB]/55">({selected.specification.tradingHoursTimezone})</span>
                </Field>
                <Field label="Margin">
                  {selected.specification.marginRequirement === null ? (
                    <span className="text-[#F59E0B]">UNAVAILABLE — not stored (changes frequently; check the exchange/broker)</span>
                  ) : (
                    `${selected.specification.marginRequirement} ${selected.specification.marginCurrency ?? ''}`
                  )}
                </Field>
                <Field label="Data source">
                  <SourceLink href={selected.specification.dataSource} />
                </Field>
              </dl>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">Calendar rule</h2>
                  {rule.state === 'ok' && rule.data.rule && <VerificationBadge status={rule.data.rule.verificationStatus} />}
                </div>
                {rule.state === 'loading' || rule.state === 'idle' ? (
                  <p className="text-[#E5E7EB]/55">Loading...</p>
                ) : rule.state === 'error' ? (
                  <p className="font-mono text-[#EF4444]">{rule.message}</p>
                ) : !rule.data.rule ? (
                  <p className="font-mono text-[#F59E0B]">UNAVAILABLE — no calendar rule recorded for this instrument.</p>
                ) : (
                  <dl>
                    <Field label="Listed months">
                      <span className="font-sans">{rule.data.rule.listedMonths}</span>
                    </Field>
                    <Field label="Last trading day">
                      <span className="font-sans">{rule.data.rule.lastTradingDayRule}</span>
                    </Field>
                    {rule.data.rule.notes && (
                      <Field label="Notes">
                        <span className="font-sans text-[#E5E7EB]/75">{rule.data.rule.notes}</span>
                      </Field>
                    )}
                    <Field label="Source">
                      <SourceLink href={rule.data.rule.sourceUrl} />
                    </Field>
                  </dl>
                )}
              </section>

              <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">MXV mapping</h2>
                  <VerificationBadge status={selected.mxvMapping?.mappingStatus ?? 'UNAVAILABLE'} />
                </div>
                {selected.mxvMapping ? (
                  <dl>
                    <Field label="MXV code">{selected.mxvMapping.mxvSymbol ?? <NullValue />}</Field>
                    <Field label="International">
                      {selected.mxvMapping.internationalExchange}:{selected.mxvMapping.internationalSymbol}
                    </Field>
                    <Field label="MXV-listed flag">{selected.isMvxListed ? 'YES' : 'NO'}</Field>
                    <Field label="Notes">
                      <span className="font-sans text-[#E5E7EB]/75">{selected.mxvMapping.notes || '—'}</span>
                    </Field>
                  </dl>
                ) : (
                  <p className="font-mono text-[#F59E0B]">UNAVAILABLE — no MXV mapping recorded.</p>
                )}
              </section>
            </div>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">Contract chain</h2>
                  <p className="text-xs text-[#E5E7EB]/55">
                    From <span className="font-mono">GET /api/contracts/{selected.id}/chain</span>
                  </p>
                </div>
                <div className="flex items-end gap-2">
                  <label className="text-xs text-[#E5E7EB]/65 space-y-1">
                    <span className="block">As of</span>
                    <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={selectClass} />
                  </label>
                  <label className="text-xs text-[#E5E7EB]/65 space-y-1">
                    <span className="block">Contracts</span>
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
                <p className="text-xs text-[#E5E7EB]/55">Loading chain...</p>
              ) : chain.state === 'error' ? (
                <div className="flex items-center gap-2 text-xs">
                  <DataStatusBadge status="UNAVAILABLE" />
                  <span className="font-mono text-[#EF4444]">{chain.message}</span>
                </div>
              ) : (
                <ContractChainTable chain={chain.data} />
              )}
            </section>

            <TickCalculator key={selected.id} spec={selected.specification} />
          </div>
        ) : (
          <div className="bg-[#111622] border border-[#263244] rounded-lg p-6 text-xs text-[#E5E7EB]/55">
            {loading ? 'Loading instruments...' : 'Select an instrument.'}
          </div>
        )}
      </div>
    </div>
  );
}
