import { useMemo, useState } from 'react';
import { ArrowRight, RefreshCw, ShieldAlert } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { ExchangeCode, ProductCategory } from '../../shared/types/instrument';
import { VerificationBadge } from './explorer/VerificationBadge';
import { fmtDate, fmtNum, useT } from '../../i18n';

export function ContractExplorerView() {
  const {
    instruments,
    selectedSymbol,
    setSelectedSymbol,
    openInstrumentIn,
    syncing,
    timeframe,
    syncProviderFeeds,
  } = useTerminal();
  const t = useT();
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ProductCategory>('ALL');
  const [exchangeFilter, setExchangeFilter] = useState<'ALL' | ExchangeCode>('ALL');

  const filtered = useMemo(() => {
    return instruments.filter((inst) => {
      if (categoryFilter !== 'ALL' && inst.category !== categoryFilter) return false;
      if (exchangeFilter !== 'ALL' && inst.exchange !== exchangeFilter) return false;
      return true;
    });
  }, [instruments, categoryFilter, exchangeFilter]);

  const activeContract =
    instruments.find((i) => i.exchangeSymbol === selectedSymbol) ?? filtered[0] ?? null;

  const profile = activeContract?.commodityProfile;
  const mappings = activeContract?.providerMappings;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            {t('exp.o.title')}
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            {t('exp.o.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t('exp.o.filterCategory')}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | ProductCategory)}
            className="bg-[#111622] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#6366F1]"
          >
            <option value="ALL">{t('exp.allCategories')}</option>
            <option value="AGRICULTURE">{t('exp.o.cat.AGRICULTURE')}</option>
            <option value="SOFT_COMMODITIES">{t('exp.o.cat.SOFT_COMMODITIES')}</option>
            <option value="METALS">{t('exp.o.cat.METALS')}</option>
            <option value="ENERGY">{t('exp.o.cat.ENERGY')}</option>
          </select>

          <select
            aria-label={t('exp.o.filterExchange')}
            value={exchangeFilter}
            onChange={(e) => setExchangeFilter(e.target.value as 'ALL' | ExchangeCode)}
            className="bg-[#111622] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#6366F1]"
          >
            <option value="ALL">{t('exp.allExchanges')}</option>
            <option value="MXV">MXV</option>
            <option value="ICE">ICE</option>
            <option value="CBOT">CBOT</option>
            <option value="CME">CME</option>
            <option value="COMEX">COMEX</option>
            <option value="NYMEX">NYMEX</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Contract List (1/3) */}
        <section
          aria-label={t('exp.o.registered')}
          className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-[#263244] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{t('exp.o.contractsCount', { n: filtered.length })}</h2>
            <span className="text-xs font-mono text-[#E5E7EB]/50">
              {t('exp.o.masterSpecs', { n: instruments.length })}
            </span>
          </div>
          <ul className="divide-y divide-[#263244]/70 max-h-[680px] overflow-y-auto p-1.5 space-y-1">
            {filtered.map((inst) => {
              const isSelected = activeContract?.id === inst.id;
              return (
                <li key={inst.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSymbol(inst.exchangeSymbol)}
                    className={`w-full text-left px-3 py-2.5 rounded-md flex items-center justify-between gap-2 transition-colors border ${
                      isSelected
                        ? 'bg-[#6366F1]/15 border-[#6366F1]/60'
                        : 'border-transparent hover:bg-[#172033]/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-white truncate">
                        {inst.commodityProfile?.vietnameseName ?? inst.productName}
                      </div>
                      <div className="text-[11px] font-mono text-[#E5E7EB]/55">
                        {inst.exchange}:{inst.exchangeSymbol}
                        {inst.mxvMapping?.mxvSymbol ? ` · MXV ${inst.mxvMapping.mxvSymbol}` : ''}
                      </div>
                    </div>
                    <span
                      title={inst.specification.verificationStatus}
                      className={`text-[11px] font-mono shrink-0 ${
                        inst.specification.verificationStatus === 'VERIFIED'
                          ? 'text-[#22C55E]'
                          : 'text-[#F59E0B]'
                      }`}
                    >
                      {t(`verify.${inst.specification.verificationStatus}`)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Detailed Contract Specification & Commodity Analysis Inspector (2/3) */}
        <section
          aria-label={t('exp.o.details')}
          className="xl:col-span-2 bg-[#111622] border border-[#263244] rounded-lg p-5 space-y-5"
        >
          {!activeContract ? (
            <div className="py-10 text-center text-xs text-[#E5E7EB]/60 font-mono">
              {t('exp.o.selectContract')}
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#263244] pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-lg font-semibold text-white">
                      {profile?.vietnameseName
                        ? `${profile.vietnameseName} (${activeContract.productName})`
                        : activeContract.productName}
                    </h2>
                    <span className="font-mono text-xs px-2 py-0.5 bg-[#172033] border border-[#263244] rounded text-white">
                      {activeContract.exchange}:{activeContract.exchangeSymbol}
                    </span>
                  </div>
                  <p className="text-xs text-[#E5E7EB]/60 mt-1 font-mono">
                    {t('exp.o.idSource', { id: activeContract.id, source: activeContract.specification.dataSource })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void syncProviderFeeds({
                        symbol: activeContract.exchangeSymbol,
                        timeframe,
                      })
                    }
                    disabled={syncing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-xs text-white disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                    <span>{t('exp.o.sync', { symbol: activeContract.exchangeSymbol })}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openInstrumentIn(activeContract.exchangeSymbol, 'charts')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-xs text-white"
                  >
                    <span>{t('exp.o.chart')}</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openInstrumentIn(activeContract.exchangeSymbol, 'risk')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 rounded-md text-xs font-medium text-white"
                  >
                    <span>{t('exp.o.sizePosition')}</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {activeContract.specification.verificationStatus !== 'VERIFIED' && (
                <div className="bg-[#0B0E14] border border-[#F59E0B]/40 rounded-md p-3 flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-xs text-[#E5E7EB]/80">
                    <span className="font-mono font-semibold text-[#F59E0B]">
                      {t(`verify.${activeContract.specification.verificationStatus}`)} ({activeContract.specification.verificationStatus}):
                    </span>{' '}
                    {t('exp.o.unverifiedWarn')}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-3">
                  <p className="text-[#E5E7EB]/55">{t('term.contractSize')}</p>
                  <p className="font-mono text-sm text-white mt-1 tabular-nums">
                    {activeContract.specification.contractSize !== null
                      ? `${fmtNum(activeContract.specification.contractSize)} ${activeContract.specification.contractSizeUnit}`
                      : t('exp.unavailable')}
                  </p>
                </div>

                <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-3">
                  <p className="text-[#E5E7EB]/55">{t('exp.o.minTick')}</p>
                  <p className="font-mono text-sm text-white mt-1 tabular-nums">
                    {activeContract.specification.minimumTickSize !== null
                      ? fmtNum(activeContract.specification.minimumTickSize)
                      : t('exp.unavailable')}
                  </p>
                </div>

                <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-3">
                  <p className="text-[#E5E7EB]/55">{t('term.tickValue')}</p>
                  <p className="font-mono text-sm text-white mt-1 tabular-nums">
                    {activeContract.specification.tickValue !== null
                      ? `${fmtNum(activeContract.specification.tickValue)} ${activeContract.specification.tradingCurrency}`
                      : t('exp.unavailable')}
                  </p>
                </div>

                <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-3">
                  <p className="text-[#E5E7EB]/55">{t('exp.o.quotationCurrency')}</p>
                  <p className="font-mono text-sm text-white mt-1">
                    {activeContract.specification.quotationUnit} ({activeContract.specification.tradingCurrency})
                  </p>
                </div>

                <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-3">
                  <p className="text-[#E5E7EB]/55">{t('exp.o.settlementMethod')}</p>
                  <p className="font-mono text-sm text-white mt-1">
                    {activeContract.specification.settlementMethod}
                  </p>
                </div>

                <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-3">
                  <p className="text-[#E5E7EB]/55">{t('exp.o.margin')}</p>
                  <p className="font-mono text-sm text-[#F59E0B] mt-1">
                    {activeContract.specification.marginRequirement !== null
                      ? `${fmtNum(activeContract.specification.marginRequirement)} ${activeContract.specification.marginCurrency ?? 'USD'}`
                      : t('exp.o.marginUnavailable')}
                  </p>
                </div>
              </div>

              {/* Vietnam MXV & Fundamental Commodity Intelligence */}
              {profile && (
                <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-4 space-y-4 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#263244] pb-2.5">
                    <h3 className="text-sm font-semibold text-white">
                      Phân tích hàng hóa & Bối cảnh Thị trường Việt Nam (MXV)
                    </h3>
                    <span className="font-mono text-[11px] text-[#6366F1]">
                      Kỳ hạn: {profile.contractMonths}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[#E5E7EB]/55">Tiêu chuẩn giao hàng (Delivery Grade)</p>
                      <p className="text-[#E5E7EB]/90 leading-relaxed">{profile.deliveryGrade}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[#E5E7EB]/55">Phiên giao dịch theo giờ Việt Nam (ICT / UTC+7)</p>
                      <p className="font-mono text-[#E5E7EB]/90 leading-relaxed">
                        {profile.vietnamTradingSessionsIct}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[#E5E7EB]/55">Liên hệ Việt Nam & Chuỗi cung ứng MXV</p>
                    <p className="text-[#E5E7EB]/90 leading-relaxed">{profile.vietnamMarketRelevance}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#263244]">
                    <div className="space-y-1.5">
                      <p className="text-[#E5E7EB]/55 font-medium">Yếu tố Cung / Cầu cốt lõi (Fundamental Drivers)</p>
                      <ul className="list-disc pl-4 space-y-1 text-[#E5E7EB]/85">
                        {profile.fundamentalDrivers.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[#E5E7EB]/55 font-medium">Tính mùa vụ (Seasonality)</p>
                        <p className="text-[#E5E7EB]/85 mt-0.5 leading-relaxed">{profile.seasonalPattern}</p>
                      </div>
                      <div>
                        <p className="text-[#E5E7EB]/55 font-medium">Độ nhạy tỷ giá USD & USD/VND</p>
                        <p className="text-[#E5E7EB]/85 mt-0.5 leading-relaxed">{profile.fxSensitivity}</p>
                      </div>
                      <div>
                        <p className="text-[#F59E0B] font-medium">Lưu ý rủi ro hợp đồng</p>
                        <p className="text-[#E5E7EB]/80 mt-0.5 leading-relaxed">{profile.riskNotes}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* External API Ticker Bindings */}
              {mappings && (
                <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-4 space-y-2.5 text-xs">
                  <p className="font-semibold text-white">{t('exp.o.bindings')}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono">
                    <div className="bg-[#111622] border border-[#263244] rounded p-2">
                      <span className="text-[10px] text-[#E5E7EB]/50 block">{t('exp.chain.mxvCode')}</span>
                      <span className="text-white">{mappings.mxvCode ?? t('common.na')}</span>
                    </div>
                    <div className="bg-[#111622] border border-[#263244] rounded p-2">
                      <span className="text-[10px] text-[#E5E7EB]/50 block">Twelve Data</span>
                      <span className="text-white">{mappings.twelveDataSymbol ?? t('exp.o.unmapped')}</span>
                    </div>
                    <div className="bg-[#111622] border border-[#263244] rounded p-2">
                      <span className="text-[10px] text-[#E5E7EB]/50 block">FMP (/stable)</span>
                      <span className="text-white">{mappings.fmpSymbol ?? t('exp.o.unmapped')}</span>
                    </div>
                    <div className="bg-[#111622] border border-[#263244] rounded p-2">
                      <span className="text-[10px] text-[#E5E7EB]/50 block">Commodities-API</span>
                      <span className="text-white">{mappings.commoditiesApiSymbol ?? t('exp.o.unmapped')}</span>
                    </div>
                    <div className="bg-[#111622] border border-[#263244] rounded p-2">
                      <span className="text-[10px] text-[#E5E7EB]/50 block">Alpha Vantage</span>
                      <span className="text-white">{mappings.alphaVantageFunction ?? t('exp.o.unmapped')}</span>
                    </div>
                    <div className="bg-[#111622] border border-[#263244] rounded p-2">
                      <span className="text-[10px] text-[#E5E7EB]/50 block">EIA / USDA</span>
                      <span className="text-white">
                        {mappings.eiaSeriesType ?? mappings.usdaCommodity ?? t('common.none')}
                      </span>
                    </div>
                  </div>
                  {(mappings.alphaVantageNote || mappings.twelveDataNote) && (
                    <p className="text-[11px] text-[#F59E0B] leading-relaxed">
                      {t('exp.o.proxy', { note: mappings.twelveDataNote ?? mappings.alphaVantageNote })}
                    </p>
                  )}
                </div>
              )}

              <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-4 space-y-2 text-xs">
                <p className="text-[#E5E7EB]/55">
                  {t('exp.o.tradingHours', { tz: activeContract.specification.tradingHoursTimezone })}
                </p>
                <p className="font-mono text-[#E5E7EB]">
                  {activeContract.specification.tradingHoursSummary}
                </p>
                <div className="pt-2 border-t border-[#263244] flex flex-wrap gap-6 font-mono text-[#E5E7EB]/70">
                  <span>
                    {t('exp.o.expiration', {
                      v: activeContract.specification.expirationDate
                        ? fmtDate(activeContract.specification.expirationDate)
                        : t('exp.o.continuous'),
                    })}
                  </span>
                  <span>
                    {t('exp.o.firstNotice', {
                      v: activeContract.specification.firstNoticeDate
                        ? fmtDate(activeContract.specification.firstNoticeDate)
                        : t('exp.unavailable'),
                    })}
                  </span>
                </div>
              </div>

              <div className="bg-[#0B0E14] border border-[#263244] rounded-md p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">{t('exp.o.mxvMapping')}</p>
                  {/* Mapping verification status (not a market-data freshness status). */}
                  <VerificationBadge
                    status={activeContract.mxvMapping?.mappingStatus ?? 'UNAVAILABLE'}
                    title={t('exp.o.mxvMappingTitle')}
                  />
                </div>
                {activeContract.mxvMapping ? (
                  <div className="space-y-1">
                    <p className="font-mono text-[#E5E7EB]">
                      {t('exp.o.mxvSymbol', { v: activeContract.mxvMapping.mxvSymbol ?? t('common.none') })}
                    </p>
                    <p className="text-[#E5E7EB]/65">{activeContract.mxvMapping.notes}</p>
                  </div>
                ) : (
                  <p className="text-[#E5E7EB]/60">
                    {t('exp.o.noMxv')}
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
