import type {
  CommodityDataHealthRow,
  DataHealthStatusCounts,
  EngineReadinessItem,
  FullDataHealthReport,
} from '../../src/shared/types/dataHealth.ts';
import type { FundamentalMacroRecord } from '../../src/shared/types/analysis.ts';
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { DataQualityStatus, MarketQuote, ProviderHealth } from '../../src/shared/types/market.ts';
import { getTailoredSupplyDemandBlueprint } from '../../src/shared/data/commodityResearchCatalog.ts';
import type { CotService } from '../cot/service.ts';
import { auditHistoricalCoverage } from '../engines/historicalDataEngine.ts';
import type { ProviderRegistry } from '../providers/registry.ts';
import type { DatasetRecord, ICandleRepository } from '../storage/candleRepository.ts';
import { loadEngineCandles } from './engineCandles.ts';
import { EXCHANGE_LICENSING_MATRIX } from './exchangeLicensing.ts';
import { buildFundamentalDomainsStatus, fundamentalStore } from './fundamentalService.ts';
import type { IInstrumentRepository } from './repository.ts';

export type CotHealthLike = Pick<CotService, 'health'>;

export interface DataHealthDeps {
  instruments: Pick<IInstrumentRepository, 'list'>;
  providers: Pick<ProviderRegistry, 'getAllHealth' | 'getQuoteForInstrument'>;
  candles: ICandleRepository | null;
  cotService?: CotHealthLike | null;
  now?: () => number;
}

/**
 * Deterministic 0-100 Data Quality Score per commodity:
 * - Price & Historical OHLCV Depth (max 45 pts):
 *     * Live/Delayed/Historical Quote available (10 pts)
 *     * D1 bars depth: >=30 (10 pts), >=252/1Y (+10 pts), >=1260/5Y (+10 pts), >=2520/10Y (+5 pts)
 *     * Deductions: missing gaps (-1 pt each up to -5), duplicates (-2), stale history (-5), invalid (-20)
 * - Fundamental & Macro Readiness (max 30 pts):
 *     * FRED macro baseline present (12 pts)
 *     * Commodity-specific S/D / USDA / EIA / ICE Stocks matched records (up to 18 pts)
 * - CFTC COT Positioning Readiness (max 25 pts):
 *     * If REPORTED on CFTC: synced & current (25 pts; stale = 15 pts; unsynced = 0 pts)
 *     * If NOT_REPORTED on CFTC (e.g. MXV/SGX/ICE Europe RC/BRN/TIO/JRU): not penalized harshly,
 *       normalized against non-COT universe or capped proportionally (15 pts baseline for transparent N/A status)
 */
export function computeInstrumentDataQualityScore(input: {
  quoteStatus: DataQualityStatus;
  dailyBars: number;
  missingGapCount: number;
  duplicateCount: number;
  invalidOhlcCount: number;
  historicalFreshness: DataQualityStatus;
  macroPresent: boolean;
  commodityFundamentalCount: number;
  cotStatus: 'SYNCED' | 'STALE' | 'UNSYNCED' | 'NOT_REPORTED';
  cotWeeks: number;
}): { total: number; priceAndHistory: number; fundamental: number; cot: number } {
  let priceScore = 0;
  if (input.quoteStatus === 'CURRENT' || input.quoteStatus === 'DELAYED') priceScore += 10;
  else if (input.quoteStatus === 'HISTORICAL') priceScore += 7;
  else if (input.quoteStatus === 'STALE') priceScore += 3;

  if (input.dailyBars >= 30) priceScore += 10;
  if (input.dailyBars >= 252) priceScore += 10;
  if (input.dailyBars >= 1260) priceScore += 10;
  if (input.dailyBars >= 2520) priceScore += 5;

  priceScore -= Math.min(5, input.missingGapCount);
  if (input.duplicateCount > 0) priceScore -= 2;
  if (input.historicalFreshness === 'STALE' && input.dailyBars > 0) priceScore -= 5;
  if (input.invalidOhlcCount > 0 || input.quoteStatus === 'INVALID' || input.historicalFreshness === 'INVALID') {
    priceScore -= 20;
  }
  priceScore = Math.max(0, Math.min(45, priceScore));

  let fundScore = 0;
  if (input.macroPresent) fundScore += 12;
  if (input.commodityFundamentalCount > 0) {
    fundScore += Math.min(18, input.commodityFundamentalCount * 9);
  }
  fundScore = Math.max(0, Math.min(30, fundScore));

  let cotScore = 0;
  if (input.cotStatus === 'SYNCED') {
    cotScore = input.cotWeeks >= 52 ? 25 : 18;
  } else if (input.cotStatus === 'STALE') {
    cotScore = 15;
  } else if (input.cotStatus === 'NOT_REPORTED') {
    cotScore = 15; // Non-US exchange product (transparently N/A rather than missing CFTC feed)
  }
  cotScore = Math.max(0, Math.min(25, cotScore));

  return {
    total: Math.max(0, Math.min(100, priceScore + fundScore + cotScore)),
    priceAndHistory: priceScore,
    fundamental: fundScore,
    cot: cotScore,
  };
}

function countCommodityFundamentalMatches(
  instrument: InstrumentDefinition,
  records: FundamentalMacroRecord[]
): number {
  const blueprint = getTailoredSupplyDemandBlueprint(instrument.id);
  const symUpper = instrument.exchangeSymbol.toUpperCase();
  const allKeywords = blueprint.flatMap((bp) => bp.datasetKeywords);
  return records.filter((r) => {
    if (r.relatedSymbols?.map((s) => s.toUpperCase()).includes(symUpper)) return true;
    const hay = `${r.dataset} ${r.source} ${r.dataPeriod}`.toUpperCase();
    return allKeywords.some((kw) => hay.includes(kw));
  }).length;
}

function tallyStatus(
  counts: DataHealthStatusCounts,
  status: DataQualityStatus
): void {
  if (status === 'CURRENT') counts.current += 1;
  else if (status === 'DELAYED') counts.delayed += 1;
  else if (status === 'HISTORICAL') counts.historical += 1;
  else if (status === 'STALE') counts.stale += 1;
  else if (status === 'INVALID') counts.invalid += 1;
  else counts.unavailable += 1;
}

export async function buildFullDataHealthReport(deps: DataHealthDeps): Promise<FullDataHealthReport> {
  const nowMs = deps.now ? deps.now() : Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const [instruments, providerHealths, allDatasets] = await Promise.all([
    deps.instruments.list(),
    deps.providers.getAllHealth(),
    deps.candles ? deps.candles.listDatasets() : Promise.resolve([] as DatasetRecord[]),
  ]);

  const quotes: MarketQuote[] = await Promise.all(
    instruments.map((inst) => deps.providers.getQuoteForInstrument(inst))
  );

  let cotHealth: ReturnType<CotHealthLike['health']> | null = null;
  if (deps.cotService) {
    try {
      cotHealth = deps.cotService.health();
    } catch {
      cotHealth = null;
    }
  }

  // Strictly enforce no-look-ahead (publicationTimestamp <= nowIso)
  const fundamentalRecords = fundamentalStore.listRecords({ asOf: nowIso, nowMs });
  const macroPresent = fundamentalRecords.some((r) => r.category === 'MACRO');

  const statusBreakdown: DataHealthStatusCounts = {
    current: 0,
    delayed: 0,
    historical: 0,
    stale: 0,
    unavailable: 0,
    invalid: 0,
  };

  const commodities: CommodityDataHealthRow[] = [];

  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i];
    const quote = quotes[i];
    const instDatasets = allDatasets.filter((d) => d.instrumentId === inst.id);
    const d1Res = await loadEngineCandles(deps.candles, inst, 'D1');
    const w1Res = await loadEngineCandles(deps.candles, inst, 'W1');

    const histAudit = auditHistoricalCoverage({
      instrument: inst,
      dailyCandles: d1Res.candles,
      weeklyCandles: w1Res.candles,
      datasets: instDatasets,
      nowMs,
    });

    const cotMarket = cotHealth?.markets.find((m) => m.instrumentId === inst.id);
    const cotDisagg = cotMarket?.reports.find((r) => r.reportType === 'DISAGGREGATED') ?? cotMarket?.reports[0];
    let cotStatus: CommodityDataHealthRow['cotStatus'] = 'NOT_REPORTED';
    const cotWeeks = cotDisagg?.rowCount ?? 0;
    const cotLastReportDate = cotDisagg?.lastReportDate ?? null;
    if (cotMarket?.status === 'REPORTED') {
      if (cotWeeks === 0) {
        cotStatus = 'UNSYNCED';
      } else {
        const staleCutoff = new Date(nowMs - 17 * 86_400_000).toISOString().slice(0, 10);
        cotStatus = cotLastReportDate && cotLastReportDate < staleCutoff ? 'STALE' : 'SYNCED';
      }
    }

    const fundCount = countCommodityFundamentalMatches(inst, fundamentalRecords);
    const qualityBreakdown = computeInstrumentDataQualityScore({
      quoteStatus: quote.status,
      dailyBars: histAudit.dailyBars,
      missingGapCount: histAudit.missingGapCount,
      duplicateCount: histAudit.duplicateCount,
      invalidOhlcCount: histAudit.invalidOhlcCount,
      historicalFreshness: histAudit.staleStatus,
      macroPresent,
      commodityFundamentalCount: fundCount,
      cotStatus,
      cotWeeks,
    });

    const effectiveStatus: DataQualityStatus =
      quote.status !== 'UNAVAILABLE' ? quote.status : histAudit.staleStatus;
    tallyStatus(statusBreakdown, effectiveStatus);

    const missingItems: string[] = [];
    if (quote.price === null) missingItems.push('LIVE_QUOTE');
    if (histAudit.dailyBars < 30) missingItems.push('D1_HISTORY>=30');
    else if (histAudit.dailyBars < 1260) missingItems.push('5Y_HISTORY');
    if (fundCount === 0) missingItems.push('FUNDAMENTAL_SD');
    if (cotStatus === 'UNSYNCED') missingItems.push('CFTC_COT');

    commodities.push({
      instrumentId: inst.id,
      symbol: inst.exchangeSymbol,
      productName: inst.productName,
      vietnameseName: inst.commodityProfile?.vietnameseName ?? inst.productName,
      exchange: inst.exchange,
      category: inst.category,
      isMvxListed: inst.isMvxListed,
      quotationUnit: inst.specification.quotationUnit,
      quoteStatus: quote.status,
      quotePrice: quote.price,
      quoteSource: quote.source,
      quoteTimestamp: quote.timestamp,
      dailyBars: histAudit.dailyBars,
      weeklyBars: histAudit.weeklyBars,
      monthlyBars: histAudit.monthlyBars,
      earliestDate: histAudit.earliestDate,
      latestDate: histAudit.latestDate,
      spanYears: histAudit.spanYears,
      coverage1Y: histAudit.coverage1Y,
      coverage3Y: histAudit.coverage3Y,
      coverage5Y: histAudit.coverage5Y,
      coverage10Y: histAudit.coverage10Y,
      missingGapCount: histAudit.missingGapCount,
      duplicateCount: histAudit.duplicateCount,
      invalidOhlcCount: histAudit.invalidOhlcCount,
      historicalFreshness: histAudit.staleStatus,
      individualContracts: histAudit.seriesSeparation.individualContracts,
      continuousAdjustments: histAudit.seriesSeparation.continuousSeries.map((c) => c.adjustment),
      vendorProxyCount: histAudit.seriesSeparation.vendorProxySeries.length,
      rollNotice: histAudit.seriesSeparation.rollNotice,
      cotStatus,
      cotWeeks,
      cotLastReportDate,
      fundamentalCount: fundCount,
      dataQualityScore: qualityBreakdown.total,
      qualityBreakdown: {
        priceAndHistory: qualityBreakdown.priceAndHistory,
        fundamental: qualityBreakdown.fundamental,
        cot: qualityBreakdown.cot,
      },
      missingItems,
    });
  }

  const connectedCount = providerHealths.filter((p) => p.connectionState === 'CONNECTED').length;
  const configuredCount = providerHealths.filter((p) => p.credentialsConfigured).length;
  const degradedCount = providerHealths.filter(
    (p) => p.connectionState === 'DEGRADED' || p.connectionState === 'ERROR'
  ).length;
  const lastSuccessfulUpdate = providerHealths
    .map((p) => p.lastSuccessfulSyncAt)
    .filter((s): s is string => Boolean(s))
    .sort()
    .at(-1) ?? null;

  const overallQualityScore =
    commodities.length > 0
      ? Math.round(commodities.reduce((acc, c) => acc + c.dataQualityScore, 0) / commodities.length)
      : 0;

  const liveProvider = providerHealths.some((p: ProviderHealth) => p.dataStatus === 'CURRENT');
  const delayedProvider = providerHealths.some((p: ProviderHealth) => p.dataStatus === 'DELAYED');
  const histData = commodities.some((c) => c.dailyBars > 0);
  const overallStatus: DataQualityStatus = liveProvider
    ? 'CURRENT'
    : delayedProvider
      ? 'DELAYED'
      : histData
        ? 'HISTORICAL'
        : 'UNAVAILABLE';

  const withCotWeeks = cotHealth?.markets.reduce(
    (acc, m) => acc + m.reports.reduce((rAcc, r) => rAcc + r.rowCount, 0),
    0
  ) ?? 0;
  const latestCotDate =
    cotHealth?.markets
      .flatMap((m) => m.reports.map((r) => r.lastReportDate))
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;

  const fundamentalDomains = buildFundamentalDomainsStatus({
    records: fundamentalRecords,
    cotHealth: cotHealth
      ? {
          overallStatus: cotHealth.overallStatus,
          reportedMarketsCount: cotHealth.markets.filter(
            (m) => m.status === 'REPORTED' && m.reports.some((r) => r.rowCount > 0)
          ).length,
          latestReportDate: latestCotDate,
          latestReleaseDate: latestCotDate,
          totalWeeksStored: withCotWeeks,
        }
      : null,
    dailySeriesCount: commodities.filter((c) => c.dailyBars >= 60).length,
    nowMs,
  });

  const readyD1Count = commodities.filter((c) => c.dailyBars >= 30).length;
  const readyLongCount = commodities.filter((c) => c.dailyBars >= 120).length;
  const geminiReady = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);

  const engineReadiness: EngineReadinessItem[] = [
    {
      id: 'CYCLE_ENGINE',
      name: 'Cycle Engine (H4 / D1 / W1 / Monthly)',
      status: readyLongCount === commodities.length ? 'READY' : readyD1Count > 0 ? 'PARTIAL' : 'DATA_UNAVAILABLE',
      readyInstruments: readyLongCount,
      totalInstruments: commodities.length,
      notes: 'Cần >= 120 nến D1 (tốt nhất >= 252) để phân loại 4 pha Accumulation / Early Recovery / Markup / Distribution.',
    },
    {
      id: 'BOTTOM_DETECTION_ENGINE',
      name: 'Bottom Detection Engine (Thang 100 điểm · 8 yếu tố)',
      status: readyD1Count > 0 ? 'PARTIAL' : 'DATA_UNAVAILABLE',
      readyInstruments: readyD1Count,
      totalInstruments: commodities.length,
      formulaPreserved: true,
      notes: 'Giữ nguyên trọng số chuẩn (15+15+20+15+10+10+10+5 = 100đ). Không suy diễn yếu tố thiếu.',
    },
    {
      id: 'AI_OPPORTUNITY_RADAR',
      name: 'AI Opportunity Radar & Cycle Scanner',
      status: readyD1Count > 0 ? 'PARTIAL' : 'DATA_UNAVAILABLE',
      readyInstruments: readyD1Count,
      totalInstruments: commodities.length,
      notes: 'Xếp hạng Top 10 cơ hội dựa trên Bottom Score, Phase, CFTC COT & Vĩ mô đã kiểm chứng.',
    },
    {
      id: 'COMMODITY_PROFILE',
      name: 'Commodity Profile Dossier & Dual Trade Plans',
      status: readyD1Count > 0 ? 'PARTIAL' : 'DATA_UNAVAILABLE',
      readyInstruments: commodities.filter((c) => c.quotePrice !== null || c.dailyBars >= 30).length,
      totalInstruments: commodities.length,
      notes: 'Tự động hiển thị DATA_UNAVAILABLE cho các trường chưa có dữ liệu đầu vào.',
    },
    {
      id: 'AI_RESEARCH_REPORT',
      name: 'Gemini AI Research Report (Verified Backend JSON Only)',
      status: geminiReady && readyD1Count > 0 ? 'READY' : 'DATA_UNAVAILABLE',
      readyInstruments: geminiReady ? readyD1Count : 0,
      totalInstruments: commodities.length,
      notes: geminiReady
        ? 'GEMINI_API_KEY hoạt động phía server (gemini-4-hydrogen); AI chỉ diễn giải số liệu đã xác thực.'
        : 'GEMINI_API_KEY chưa được thiết lập trên server; báo cáo AI bị khóa an toàn (fail-closed).',
    },
  ];

  return {
    generatedAt: nowIso,
    overallQualityScore,
    overallStatus,
    statusBreakdown,
    providerSummary: {
      total: providerHealths.length,
      connected: connectedCount,
      configured: configuredCount,
      degradedOrError: degradedCount,
      lastSuccessfulUpdate,
    },
    coverageSummary: {
      totalCommodities: commodities.length,
      withPriceQuote: commodities.filter((c) => c.quotePrice !== null).length,
      withDailyHistory: commodities.filter((c) => c.dailyBars >= 30).length,
      with5YHistory: commodities.filter((c) => c.coverage5Y >= 95).length,
      with10YHistory: commodities.filter((c) => c.coverage10Y >= 95).length,
      withCotHistory: commodities.filter((c) => c.cotWeeks > 0).length,
      totalMissingGaps: commodities.reduce((acc, c) => acc + c.missingGapCount, 0),
      totalStaleSeries: commodities.filter((c) => c.historicalFreshness === 'STALE').length,
    },
    commodities,
    exchangeAdapters: EXCHANGE_LICENSING_MATRIX.map((e) => ({
      ...e,
      exchanges: [...e.exchanges],
      supportedFreeSources: [...e.supportedFreeSources],
    })),
    fundamentalDomains,
    engineReadiness,
  };
}
