import type { FundamentalMacroRecord } from '../../src/shared/types/analysis.ts';
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { MarketCandle, MarketQuote } from '../../src/shared/types/market.ts';
import type {
  CommodityCycleSummary,
  CommodityProfileDossier,
  CycleMarketOverview,
  DailyResearchReportPayload,
  MacroTrackerMetric,
  SupplyDemandBias,
  TailoredSupplyDemandItem,
} from '../../src/shared/types/cycle.ts';
import { getTailoredSupplyDemandBlueprint } from '../../src/shared/data/commodityResearchCatalog.ts';
import { sortCommoditiesByPotential } from '../../src/shared/utils/commoditySort.ts';
import { buildVietnamEconomicCalendar } from '../../src/shared/utils/vietnamCalendar.ts';
import {
  CYCLE_PHASE_LABELS_VI,
  evaluateMultiTimeframeCycle,
} from '../engines/cycleEngine.ts';
import {
  buildDualTradeSetupPlans,
  runBottomDetectionEngine,
} from '../engines/bottomDetectionEngine.ts';
import { resampleDailyToWeeklyAndMonthly } from '../engines/historicalDataEngine.ts';
import type { CotService } from '../cot/service.ts';
import type { ICandleRepository } from '../storage/candleRepository.ts';
import type { IInstrumentRepository } from './repository.ts';
import type { ProviderRegistry } from '../providers/registry.ts';
import { loadEngineCandles } from './engineCandles.ts';
import { fundamentalStore } from './fundamentalService.ts';
import { baselineItemHint, cotRow, enrichSupplyDemandItems, type SupplyMacroLike } from './supplyDemandOverlay.ts';

export type CycleProviderRegistryLike = Pick<
  ProviderRegistry,
  'getQuoteForInstrument' | 'getAllHealth'
>;

export type CotQueryLike = Pick<CotService, 'query'>;

export interface CycleServiceDeps {
  instruments: Pick<IInstrumentRepository, 'list' | 'findBySymbol'>;
  providers: CycleProviderRegistryLike;
  candles: ICandleRepository;
  cotService?: CotQueryLike | null;
  /** T60: macro/official-source reader for the supply/demand rows (absent → rows show friendly hints). */
  macro?: SupplyMacroLike | null;
}

function matchSupplyDemandItems(
  instrument: InstrumentDefinition,
  records: FundamentalMacroRecord[]
): {
  items: TailoredSupplyDemandItem[];
  bias: SupplyDemandBias;
  biasScore: number | null;
  evidence: string;
} {
  const blueprint = getTailoredSupplyDemandBlueprint(instrument.id);
  let matchedCount = 0;
  let scoreSum = 0;

  const items: TailoredSupplyDemandItem[] = blueprint.map((bp) => {
    const matched = records.find((rec) => {
      const hay = `${rec.dataset} ${rec.source} ${rec.dataPeriod}`.toUpperCase();
      return bp.datasetKeywords.some((kw) => hay.includes(kw));
    });

    if (!matched) {
      return {
        id: bp.id,
        label: bp.label,
        labelVi: bp.labelVi,
        unit: bp.unit,
        sourceHint: bp.sourceHint,
        latestValue: null,
        previousValue: null,
        period: null,
        impact: 'UNAVAILABLE',
        supportHintVi: `Thường hỗ trợ giá khi: ${bp.bullishWhen}.`,
        ...baselineItemHint(bp),
      };
    }

    matchedCount += 1;
    if (matched.impactAssessment === 'BULLISH') scoreSum += 1;
    else if (matched.impactAssessment === 'BEARISH') scoreSum -= 1;

    return {
      id: bp.id,
      label: bp.label,
      labelVi: bp.labelVi,
      unit: matched.unit || bp.unit,
      sourceHint: matched.source,
      latestValue: matched.actualValue,
      previousValue: matched.previousValue,
      period: matched.dataPeriod,
      impact: matched.impactAssessment,
      notes: `Nguồn: ${matched.source} (${matched.revisionStatus}).`,
      state: 'OK',
      asOf: matched.dataPeriod,
      sourceName: matched.source,
      supportHintVi: `Thường hỗ trợ giá khi: ${bp.bullishWhen}.`,
    };
  });

  if (matchedCount === 0) {
    return {
      items,
      bias: 'DATA_UNAVAILABLE',
      biasScore: null,
      evidence: 'Chưa có báo cáo Cung–Cầu tự động (WASDE/EIA/USDA) cho mã này.',
    };
  }

  const avg = scoreSum / matchedCount;
  const bias: SupplyDemandBias =
    avg >= 0.4
      ? 'TIGHTENING'
      : avg <= -0.4
        ? 'SURPLUS_PRESSURE'
        : avg < 0
          ? 'LOOSENING'
          : 'BALANCED';

  return {
    items,
    bias,
    biasScore: Number(avg.toFixed(2)),
    evidence: `Tổng hợp ${matchedCount} chỉ tiêu Cung–Cầu đã đồng bộ (${bias}).`,
  };
}

function buildMacroTrackerMetrics(params: {
  records: FundamentalMacroRecord[];
  quotesById: Map<string, MarketQuote>;
  summaries: CommodityCycleSummary[];
}): MacroTrackerMetric[] {
  const { records, quotesById, summaries } = params;

  const findRecord = (keywords: string[]) =>
    records.find((r) => {
      const ds = `${r.dataset} ${r.source}`.toUpperCase();
      return keywords.some((k) => ds.includes(k));
    });

  const makeRecordMetric = (
    id: MacroTrackerMetric['id'],
    label: string,
    labelVi: string,
    keywords: string[],
    defaultUnit: string,
    implicationFn: (r?: FundamentalMacroRecord) => string
  ): MacroTrackerMetric => {
    const rec = findRecord(keywords);
    if (!rec || rec.actualValue === null) {
      return {
        id,
        label,
        labelVi,
        value: null,
        unit: defaultUnit,
        changeLabel: null,
        source: 'UNCONFIGURED',
        timestamp: null,
        status: 'UNAVAILABLE',
        cycleImplication: 'DATA_UNAVAILABLE — Cấu hình FRED_API_KEY hoặc nhập bản ghi Fundamental.',
      };
    }
    let changeLabel: string | null = null;
    if (typeof rec.actualValue === 'number' && typeof rec.previousValue === 'number') {
      const diff = rec.actualValue - rec.previousValue;
      changeLabel = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} vs kỳ trước`;
    }
    return {
      id,
      label,
      labelVi,
      value: rec.actualValue,
      unit: rec.unit || defaultUnit,
      changeLabel,
      source: rec.source,
      timestamp: rec.publicationTimestamp,
      status: 'HISTORICAL',
      cycleImplication: implicationFn(rec),
    };
  };

  const wtiQuote = quotesById.get('NYMEX:CL');
  const goldQuote = quotesById.get('COMEX:GC');

  const pricedWithReturns = summaries.filter((s) => s.returns.m1 !== null);
  const avgM1 =
    pricedWithReturns.length >= 3
      ? pricedWithReturns.reduce((acc, s) => acc + (s.returns.m1 ?? 0), 0) / pricedWithReturns.length
      : null;

  const tighteningCount = summaries.filter((s) => s.supplyDemandBias === 'TIGHTENING').length;
  const surplusCount = summaries.filter((s) => s.supplyDemandBias === 'SURPLUS_PRESSURE').length;

  return [
    makeRecordMetric('DXY', 'USD Index (Broad / DXY)', 'Chỉ số USD (DXY)', ['DXY', 'DTWEXBGS'], 'Index', (r) =>
      r?.impactAssessment === 'BULLISH'
        ? 'USD suy yếu hỗ trợ dòng tiền vào hàng hóa định giá USD.'
        : 'USD mạnh gây áp lực chiết khấu lên nhóm Nông sản & Kim loại.'
    ),
    makeRecordMetric('FED_FUNDS', 'Fed Funds Rate', 'Lãi suất điều hành Fed', ['FED_FUNDS', 'FEDFUNDS'], '%', (r) =>
      r?.impactAssessment === 'BULLISH'
        ? 'Kỳ vọng hạ nhiệt lãi suất giảm chi phí lưu kho hàng hóa.'
        : 'Mặt bằng lãi suất cao siết thanh khoản đầu cơ.'
    ),
    makeRecordMetric('US_10Y', 'US 10Y Treasury Yield', 'Lợi suất Trái phiếu Mỹ 10Y', ['US_10Y', 'DGS10'], '%', () =>
      'Lợi suất thực biến động chi phối trực tiếp Vàng, Bạc và dòng vốn hàng hóa.'
    ),
    makeRecordMetric('US_CPI', 'US CPI Inflation', 'Lạm phát CPI Mỹ', ['CPI', 'CPIAUCSL'], 'Index', () =>
      'Áp lực lạm phát duy trì nhu cầu phòng hộ bằng tài sản thực & năng lượng.'
    ),
    {
      id: 'WTI_CRUDE',
      label: 'Crude Oil Benchmark (WTI)',
      labelVi: 'Giá Dầu thô WTI',
      value: wtiQuote?.price ?? null,
      unit: wtiQuote?.unit ?? 'USD/bbl',
      changeLabel: wtiQuote?.source && wtiQuote.price !== null ? wtiQuote.source : null,
      source: wtiQuote?.source ?? 'NONE',
      timestamp: wtiQuote?.timestamp ?? null,
      status: wtiQuote?.status ?? 'UNAVAILABLE',
      cycleImplication:
        wtiQuote?.price !== null
          ? 'Dầu thô chi phối chi phí phân bón, vận tải biển và nhóm Ethanol/Đường.'
          : 'DATA_UNAVAILABLE — Chưa có nguồn giá WTI.',
    },
    {
      id: 'GOLD_SPOT',
      label: 'Gold Benchmark (COMEX)',
      labelVi: 'Giá Vàng COMEX',
      value: goldQuote?.price ?? null,
      unit: goldQuote?.unit ?? 'USD/oz',
      changeLabel: goldQuote?.source && goldQuote.price !== null ? goldQuote.source : null,
      source: goldQuote?.source ?? 'NONE',
      timestamp: goldQuote?.timestamp ?? null,
      status: goldQuote?.status ?? 'UNAVAILABLE',
      cycleImplication:
        goldQuote?.price !== null
          ? 'Thước đo phòng hộ lạm phát, rủi ro địa chính trị và thanh khoản toàn cầu.'
          : 'DATA_UNAVAILABLE — Chưa có nguồn giá Vàng.',
    },
    {
      id: 'BASKET_INDEX',
      label: 'Tracked Basket Avg (1M)',
      labelVi: 'Hiệu suất Giỏ hàng hóa (1M)',
      value: avgM1 !== null ? `${avgM1 >= 0 ? '+' : ''}${avgM1.toFixed(2)}%` : null,
      unit: '% (1M equal-weight)',
      changeLabel: avgM1 !== null ? `${pricedWithReturns.length} hàng hóa có chuỗi 1M` : null,
      source: avgM1 !== null ? 'DETERMINISTIC_BASKET_ENGINE' : 'NONE',
      timestamp: avgM1 !== null ? new Date().toISOString() : null,
      status: avgM1 !== null ? 'HISTORICAL' : 'UNAVAILABLE',
      cycleImplication:
        avgM1 !== null
          ? 'Trung bình biến động 1 tháng của các mặt hàng đã có lịch sử D1.'
          : 'DATA_UNAVAILABLE — Cần tối thiểu 3 mặt hàng có chuỗi D1 >= 30 ngày.',
    },
    {
      id: 'GLOBAL_SD',
      label: 'Global Supply/Demand Balance',
      labelVi: 'Cán cân Cung – Cầu Tổng hợp',
      value:
        tighteningCount + surplusCount > 0
          ? `${tighteningCount} Thắt chặt / ${surplusCount} Dư cung`
          : null,
      unit: 'Datasets',
      changeLabel: records.length > 0 ? `${records.length} bản ghi Fundamental` : null,
      source: records.length > 0 ? 'SOURCED_FUNDAMENTAL_STORE' : 'NONE',
      timestamp: records[0]?.publicationTimestamp ?? null,
      status: tighteningCount + surplusCount > 0 ? 'HISTORICAL' : 'UNAVAILABLE',
      cycleImplication:
        tighteningCount + surplusCount > 0
          ? 'Tổng hợp từ các báo cáo EIA/USDA/Fundamental đã nạp vào hệ thống.'
          : 'DATA_UNAVAILABLE — Nạp dữ liệu USDA/EIA để đánh giá cán cân.',
    },
  ];
}

function deriveMacroScoreNormalized(macroMetrics: MacroTrackerMetric[]): {
  score: number | null;
  evidence: string;
} {
  const dxy = macroMetrics.find((m) => m.id === 'DXY');
  const fed = macroMetrics.find((m) => m.id === 'FED_FUNDS');
  if (dxy?.status === 'UNAVAILABLE' && fed?.status === 'UNAVAILABLE') {
    return {
      score: null,
      evidence: 'DATA_UNAVAILABLE — Chưa có dữ liệu DXY / Fed Funds từ FRED hoặc Fundamental store.',
    };
  }
  let score = 0;
  let signals = 0;
  if (dxy && dxy.status !== 'UNAVAILABLE') {
    signals += 1;
    if (dxy.changeLabel?.startsWith('-')) score += 0.6;
    else if (dxy.changeLabel?.startsWith('+')) score -= 0.4;
  }
  if (fed && fed.status !== 'UNAVAILABLE') {
    signals += 1;
    if (fed.changeLabel?.startsWith('-')) score += 0.5;
    else if (fed.changeLabel?.startsWith('+')) score -= 0.4;
  }
  return {
    score: signals > 0 ? Math.max(-1, Math.min(1, score / signals)) : null,
    evidence: `Đánh giá vĩ mô từ ${signals} chuỗi FRED đã đồng bộ (${dxy?.value ?? '—'} DXY, ${fed?.value ?? '—'}% Fed).`,
  };
}

export function createCycleResearchService(deps: CycleServiceDeps) {
  async function getCotSnapshotSafe(instrument: InstrumentDefinition) {
    if (!deps.cotService) {
      return {
        available: false,
        reportDate: null,
        releaseDate: null,
        managedMoneyNet: null,
        managedMoneyNetPctOi: null,
        cotIndex: null,
        commercialNet: null,
        note: 'COT chưa được kích hoạt hoặc chưa đồng bộ CFTC cho mã này.',
      };
    }
    try {
      const cot = deps.cotService.query(instrument.id, {
        reportType: 'DISAGGREGATED',
        lookbackWeeks: 52,
        maxMissingWeeks: 8,
      });
      if (cot.analytics.status !== 'OK' || !cot.analytics.latest) {
        return {
          available: false,
          reportDate: null,
          releaseDate: null,
          managedMoneyNet: null,
          managedMoneyNetPctOi: null,
          cotIndex: null,
          commercialNet: null,
          note: cot.analytics.reason ?? 'Chưa đồng bộ đủ dữ liệu CFTC COT (52 tuần).',
        };
      }
      const latest = cot.analytics.latest;
      const mm = latest.categories.managedMoney;
      const comm = latest.categories.producerMerchant ?? latest.categories.commercial;
      return {
        available: true,
        reportDate: latest.reportDate,
        releaseDate: latest.expectedReleaseDate,
        managedMoneyNet: mm?.net ?? null,
        managedMoneyNetPctOi: mm?.netPctOi ?? null,
        cotIndex: mm?.cotIndex ?? null,
        commercialNet: comm?.net ?? null,
        note: `CFTC Disaggregated (${latest.reportDate}), COT Index = ${mm?.cotIndex != null ? mm.cotIndex.toFixed(1) : 'N/A'}%.`,
      };
    } catch {
      return {
        available: false,
        reportDate: null,
        releaseDate: null,
        managedMoneyNet: null,
        managedMoneyNetPctOi: null,
        cotIndex: null,
        commercialNet: null,
        note: 'Không có báo cáo CFTC COT cho hợp đồng này.',
      };
    }
  }

  async function buildCommodityProfile(
    instrument: InstrumentDefinition,
    preloadedQuote?: MarketQuote
  ): Promise<CommodityProfileDossier> {
    const [quote, d1Res, w1Res, h4Res, cotSnap] = await Promise.all([
      preloadedQuote ? Promise.resolve(preloadedQuote) : deps.providers.getQuoteForInstrument(instrument),
      loadEngineCandles(deps.candles, instrument, 'D1'),
      loadEngineCandles(deps.candles, instrument, 'W1'),
      loadEngineCandles(deps.candles, instrument, 'H4'),
      getCotSnapshotSafe(instrument),
    ]);

    const effectiveWeeklyCandles: MarketCandle[] =
      w1Res.candles.length > 0
        ? w1Res.candles
        : resampleDailyToWeeklyAndMonthly(d1Res.candles).weekly.map((w) => ({
            symbol: instrument.exchangeSymbol,
            exchange: instrument.exchange,
            timeframe: 'W1',
            timestamp: w.timestamp,
            retrievedAt: d1Res.candles[0]?.retrievedAt ?? new Date().toISOString(),
            open: w.open,
            high: w.high,
            low: w.low,
            close: w.close,
            volume: w.volume,
            openInterest: w.openInterest,
            isComplete: true,
            source: w.source,
            status: 'HISTORICAL',
          }));

    const macroRecords = fundamentalStore.listRecords({ asOf: new Date().toISOString() });
    const sd = matchSupplyDemandItems(instrument, macroRecords);
    sd.items = await enrichSupplyDemandItems(
      sd.items,
      getTailoredSupplyDemandBlueprint(instrument.id),
      instrument.id,
      deps.macro
    );
    const cotItem = cotRow(cotSnap);
    if (cotItem) sd.items = [...sd.items, cotItem];

    const cycleEval = evaluateMultiTimeframeCycle({
      dailyCandles: d1Res.candles,
      weeklyCandles: effectiveWeeklyCandles,
      h4Candles: h4Res.candles,
    });

    const tempSummaryForMacro: CommodityCycleSummary = {
      instrument,
      quote,
      cyclePhase: cycleEval.primaryPhase,
      cyclePhaseLabelVi: CYCLE_PHASE_LABELS_VI[cycleEval.primaryPhase],
      bottomScore: null,
      bottomClassification: 'DATA_UNAVAILABLE',
      modelConfidenceScore: null,
      opportunityScore: null,
      percentile10Y: cycleEval.timeframes.MONTHLY.percentile10Y ?? cycleEval.timeframes.DAILY.percentile10Y,
      returns: cycleEval.returns,
      supplyDemandBias: sd.bias,
      cotNetPctOi: cotSnap.managedMoneyNetPctOi,
      cotIndex: cotSnap.cotIndex,
      lastUpdated: quote.timestamp ?? (d1Res.candles.at(-1)?.timestamp ?? null),
      dataStatus: quote.status !== 'UNAVAILABLE' ? quote.status : d1Res.status,
      missingInputs: [],
    };

    const macroContext = buildMacroTrackerMetrics({
      records: macroRecords,
      quotesById: new Map([[instrument.id, quote]]),
      summaries: [tempSummaryForMacro],
    });
    const macroInput = deriveMacroScoreNormalized(macroContext);

    const bottomDetection = runBottomDetectionEngine({
      instrument,
      dailyCandles: d1Res.candles,
      weeklyCandles: effectiveWeeklyCandles,
      timeframes: cycleEval.timeframes,
      supplyDemandBiasScore: sd.biasScore,
      supplyDemandEvidence: sd.evidence,
      cotIndex: cotSnap.cotIndex,
      cotNote: cotSnap.note,
      macroScoreNormalized: macroInput.score,
      macroEvidence: macroInput.evidence,
    });

    const tradePlans = buildDualTradeSetupPlans({
      instrument,
      dailyCandles: d1Res.candles,
      timeframes: cycleEval.timeframes,
      bottomDetection,
    });

    const missingInputs: string[] = [];
    if (quote.price === null) missingInputs.push('LIVE_OR_HIST_QUOTE');
    if (d1Res.candles.length < 30) missingInputs.push('DAILY_OHLCV>=30');
    if (sd.bias === 'DATA_UNAVAILABLE') missingInputs.push('SUPPLY_DEMAND');
    if (!cotSnap.available) missingInputs.push('CFTC_COT');

    const opportunityScore =
      bottomDetection.totalScore !== null
        ? Math.round(
            bottomDetection.totalScore * 0.72 +
              (cycleEval.primaryPhase === 'PHASE_2_EARLY_RECOVERY'
                ? 22
                : cycleEval.primaryPhase === 'PHASE_1_ACCUMULATION'
                  ? 16
                  : cycleEval.primaryPhase === 'PHASE_3_MARKUP'
                    ? 10
                    : 0)
          )
        : null;

    const summary: CommodityCycleSummary = {
      ...tempSummaryForMacro,
      bottomScore: bottomDetection.totalScore,
      bottomClassification: bottomDetection.classification,
      modelConfidenceScore: bottomDetection.modelConfidenceScore,
      opportunityScore,
      missingInputs,
    };

    return {
      summary,
      timeframes: cycleEval.timeframes,
      bottomDetection,
      tradePlans,
      supplyDemandMatrix: sd.items,
      seasonality: cycleEval.seasonality,
      cotSnapshot: cotSnap,
      macroContext,
      historicalCandlesCount: d1Res.candles.length,
    };
  }

  async function buildMarketOverview(): Promise<CycleMarketOverview> {
    const instruments = await deps.instruments.list();
    const dossiers = await Promise.all(instruments.map((inst) => buildCommodityProfile(inst)));
    const summaries = dossiers.map((d) => d.summary);
    const quotesById = new Map(summaries.map((s) => [s.instrument.id, s.quote]));
    const macroRecords = fundamentalStore.listRecords({ asOf: new Date().toISOString() });
    const macroTracker = buildMacroTrackerMetrics({ records: macroRecords, quotesById, summaries });

    const risingCount = summaries.filter((s) => (s.returns.w1 ?? 0) > 0).length;
    const fallingCount = summaries.filter((s) => (s.returns.w1 ?? 0) < 0).length;
    const withPriceData = summaries.filter((s) => s.quote.price !== null).length;
    const accumulationCount = summaries.filter((s) => s.cyclePhase === 'PHASE_1_ACCUMULATION').length;
    const markupCount = summaries.filter((s) => s.cyclePhase === 'PHASE_3_MARKUP').length;
    const distributionCount = summaries.filter((s) => s.cyclePhase === 'PHASE_4_DISTRIBUTION').length;
    const bottomCandidateCount = summaries.filter((s) => (s.bottomScore ?? 0) >= 70).length;
    const unavailableCount = summaries.filter((s) => s.cyclePhase === 'DATA_UNAVAILABLE').length;

    const sortedSummaries = sortCommoditiesByPotential(summaries);
    const opportunityRadar = sortedSummaries.slice(0, 10);

    const dataNotices: string[] = [];
    if (withPriceData === 0) {
      dataNotices.push(
        'DATA_UNAVAILABLE — Chưa có nguồn giá live hoặc dữ liệu OHLCV lịch sử được nạp. Các chỉ số giá và chu kỳ giữ nguyên trạng thái fail-closed.'
      );
    }
    if (macroRecords.length === 0) {
      dataNotices.push(
        'Vĩ mô & Cung–Cầu (FRED / USDA / EIA) chưa có bản ghi: bảng theo dõi kinh tế và điểm S/D sẽ hiển thị DATA_UNAVAILABLE cho tới khi đồng bộ.'
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      marketBreadth: {
        totalTracked: summaries.length,
        withPriceData,
        risingCount,
        fallingCount,
        accumulationCount,
        bottomCandidateCount,
        markupCount,
        distributionCount,
        unavailableCount,
      },
      opportunityRadar,
      commodities: sortedSummaries,
      macroTracker,
      dataNotices,
    };
  }

  async function buildDailyReportBase(): Promise<DailyResearchReportPayload> {
    const overview = await buildMarketOverview();
    const withData = overview.commodities.filter((c) => c.dataStatus !== 'UNAVAILABLE' || c.bottomScore !== null);
    const pool = withData.length > 0 ? withData : overview.commodities;

    const topWatch = [...pool]
      .sort((a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1))
      .slice(0, 5);

    const topBottomCandidates = [...pool]
      .filter((c) => c.bottomScore !== null)
      .sort((a, b) => (b.bottomScore ?? -1) - (a.bottomScore ?? -1))
      .slice(0, 5);

    const topDownsideRisk = [...pool]
      .filter((c) => c.cyclePhase === 'PHASE_4_DISTRIBUTION' || (c.percentile10Y ?? 0) >= 70)
      .sort((a, b) => (b.percentile10Y ?? -1) - (a.percentile10Y ?? -1))
      .slice(0, 5);

    const records = fundamentalStore.listRecords({ asOf: new Date().toISOString() }).slice(0, 8);
    const supplyDemandShifts = records.map((r) => ({
      symbol: r.dataset.split('_')[0] ?? 'MACRO',
      dataset: r.dataset,
      source: r.source,
      period: r.dataPeriod,
      impact: r.impactAssessment,
      summary: `${r.dataset}: ${r.actualValue ?? 'N/A'} ${r.unit} (kỳ trước: ${r.previousValue ?? 'N/A'})`,
    }));

    const phaseTransitions = overview.commodities
      .filter((c) => c.cyclePhase === 'PHASE_2_EARLY_RECOVERY' || c.cyclePhase === 'PHASE_4_DISTRIBUTION')
      .map((c) => ({
        symbol: c.instrument.id,
        name: c.instrument.commodityProfile?.vietnameseName ?? c.instrument.productName,
        phase: c.cyclePhase,
        note: c.cyclePhaseLabelVi,
      }));

    const calendarEvents = buildVietnamEconomicCalendar(new Date(), 3)
      .slice(0, 6)
      .map((ev) => ({
        timeIct: `${ev.dateIso} · ${ev.ictTimeLabel}`,
        title: ev.titleVi,
        impact: ev.impactLevel,
        affectedCommodities: ev.relatedSymbols,
      }));

    return {
      generatedAt: overview.generatedAt,
      aiStatus: withData.length === 0 ? 'DATA_UNAVAILABLE' : 'AI_UNCONFIGURED',
      topWatch,
      topBottomCandidates,
      topDownsideRisk,
      supplyDemandShifts,
      phaseTransitions,
      vietnamEventsToday: calendarEvents,
      aiExecutiveBriefing: null,
    };
  }

  return {
    buildCommodityProfile,
    buildMarketOverview,
    buildDailyReportBase,
  };
}
