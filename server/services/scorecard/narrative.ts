/**
 * Free narrative engine: a 4-6 sentence neutral summary (vi + en) built purely from scorecard facts via
 * templates with varied phrasing (variant picked deterministically per instrument + date). No network, no AI.
 * Output passes the same recommendation-language post-check as LLM text.
 */
import type {
  Scorecard,
  ScorecardDimension,
  ScorecardDimensionId,
  ScorecardNarrative,
} from '../../../src/shared/types/scorecard.ts';
import type { BriefText } from '../../../src/shared/types/brief.ts';
import type { InstrumentDefinition } from '../../../src/shared/types/instrument.ts';
import { stripRecommendationLanguage } from '../aiAnalyst.ts';

export const RULES_SOURCE: BriefText = {
  vi: 'Tự động theo công thức (không dùng AI trả phí)',
  en: 'Automatic, formula-based (no paid AI)',
};

const dim = (c: Scorecard, id: ScorecardDimensionId): ScorecardDimension | undefined => {
  const d = c.dimensions.find((x) => x.id === id);
  return d && d.status === 'OK' ? d : undefined;
};
const metric = (d: ScorecardDimension | undefined, key: string): number | null => {
  const v = d?.metrics.find((m) => m.key === key)?.value;
  return typeof v === 'number' ? v : null;
};
const sgn = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
const fmtNum = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(1) : x.toFixed(2));
const fmtMoney = (x: number) => Math.round(x).toLocaleString('en-US');
const lc = (s: string) => s.toLowerCase();

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

type Pair = [string, string];

export function buildRulesSentences(card: Scorecard, inst: Pick<InstrumentDefinition, 'specification'> | null): Pair[] {
  const seed = hash(`${card.instrumentId}|${card.price.asOf ?? card.generatedAt.slice(0, 10)}`);
  const pick = (k: number, opts: Pair[]): Pair => opts[(seed + k) % opts.length];
  const out: Pair[] = [];
  const name = card.vietnameseName ?? card.productName;
  const trend = dim(card, 'trend');
  const mom = dim(card, 'momentum');
  const vol = dim(card, 'volatility');
  const dd = dim(card, 'drawdown');
  const val = dim(card, 'valuation');
  const cot = dim(card, 'cot');
  const season = dim(card, 'seasonality');

  // 1. Overall picture.
  const clarity = card.overall.trendClarity;
  const risk = card.overall.volatilityRisk;
  const price = card.price.value !== null ? fmtNum(card.price.value) : null;
  const asOf = card.price.asOf ? card.price.asOf.slice(0, 10) : null;
  if (price === null) {
    out.push([
      `Hiện chưa có giá cho ${name}, nên bảng đánh giá chỉ dựa trên phần dữ liệu còn lại.`,
      `There is no price yet for ${card.productName}, so this scorecard rests only on the data that is available.`,
    ]);
  } else {
    const cVi = clarity.level ? `xu hướng "${lc(clarity.label.vi)}"` : '';
    const cEn = clarity.level ? `trend clarity "${lc(clarity.label.en)}"` : '';
    const rVi = risk.level ? `rủi ro biến động "${lc(risk.label.vi)}"` : '';
    const rEn = risk.level ? `volatility risk "${lc(risk.label.en)}"` : '';
    const joinVi = [cVi, rVi].filter(Boolean).join(' và ');
    const joinEn = [cEn, rEn].filter(Boolean).join(' and ');
    out.push(
      pick(0, [
        [
          `${name} đang ở mức ${price}${asOf ? ` (${asOf})` : ''}${joinVi ? `, với ${joinVi}` : ''}.`,
          `${card.productName} is at ${price}${asOf ? ` (${asOf})` : ''}${joinEn ? `, with ${joinEn}` : ''}.`,
        ],
        [
          `Bức tranh chung của ${name}: giá ${price}${asOf ? ` tại ${asOf}` : ''}${joinVi ? `; ${joinVi}` : ''}.`,
          `Overall picture for ${card.productName}: price ${price}${asOf ? ` on ${asOf}` : ''}${joinEn ? `; ${joinEn}` : ''}.`,
        ],
      ])
    );
  }

  // 2. Trend + momentum.
  if (trend || mom) {
    const rsi = metric(mom, 'rsi14');
    const ret = metric(mom, 'ret20');
    const retVi = ret !== null ? `, lợi suất 20 phiên ${sgn(ret * 100)}%` : '';
    const retEn = ret !== null ? `, 20-session return ${sgn(ret * 100)}%` : '';
    out.push(
      pick(1, [
        [
          `${trend ? `Về xu hướng, mã đang ở trạng thái "${lc(trend.label!.vi)}"` : 'Chưa đủ dữ liệu để xác định xu hướng'}${mom && rsi !== null ? `; động lượng "${lc(mom.label!.vi)}" (RSI ${rsi.toFixed(0)}${retVi})` : ''}.`,
          `${trend ? `On trend, the instrument reads "${lc(trend.label!.en)}"` : 'There is not enough data to judge the trend'}${mom && rsi !== null ? `; momentum is "${lc(mom.label!.en)}" (RSI ${rsi.toFixed(0)}${retEn})` : ''}.`,
        ],
        [
          `${trend ? `Xu hướng hiện là "${lc(trend.label!.vi)}"` : 'Xu hướng chưa xác định được'}${mom && rsi !== null ? `, trong khi động lượng ngắn hạn "${lc(mom.label!.vi)}" với RSI ${rsi.toFixed(0)}${retVi}` : ''}.`,
          `${trend ? `The current trend is "${lc(trend.label!.en)}"` : 'The trend cannot be determined yet'}${mom && rsi !== null ? `, while short-term momentum is "${lc(mom.label!.en)}" with RSI at ${rsi.toFixed(0)}${retEn}` : ''}.`,
        ],
      ])
    );
  }

  // 3. Volatility / risk, in money per contract when the spec has tick data.
  const vol20 = metric(vol, 'vol20');
  if (vol20 !== null && card.price.value !== null) {
    const spec = inst?.specification;
    const pctl = metric(vol, 'percentile');
    const dailyMove = (vol20 / 100 / Math.sqrt(252)) * card.price.value;
    let moneyVi = '';
    let moneyEn = '';
    if (spec && spec.minimumTickSize && spec.minimumTickSize > 0 && spec.tickValue && spec.tickValue > 0) {
      const money = (dailyMove / spec.minimumTickSize) * spec.tickValue;
      moneyVi = ` Với mức biến động này, một hợp đồng thường dao động cỡ ${fmtMoney(money)} ${spec.tradingCurrency} mỗi phiên (ước tính thống kê, không phải mức lỗ tối đa).`;
      moneyEn = ` At this volatility one contract typically moves about ${fmtMoney(money)} ${spec.tradingCurrency} per session (a statistical estimate, not a maximum loss).`;
    }
    const ddPct = metric(dd, 'drawdownPct');
    const ddVi = ddPct !== null ? ` Giá hiện thấp hơn đỉnh 52 tuần ${Math.abs(ddPct).toFixed(1)}%.` : '';
    const ddEn = ddPct !== null ? ` The price is ${Math.abs(ddPct).toFixed(1)}% below its 52-week high.` : '';
    out.push(
      pick(2, [
        [
          `Biến động thực tế 20 phiên khoảng ${vol20.toFixed(1)}%/năm${pctl !== null ? `, ở phân vị ${pctl.toFixed(0)}% so với chính 1 năm qua` : ''}.${moneyVi}${ddVi}`,
          `Realised 20-session volatility is about ${vol20.toFixed(1)}% a year${pctl !== null ? `, at the ${pctl.toFixed(0)}th percentile of the past year` : ''}.${moneyEn}${ddEn}`,
        ],
        [
          `Về rủi ro, độ biến động 20 phiên đạt ${vol20.toFixed(1)}%/năm${pctl !== null ? ` (phân vị ${pctl.toFixed(0)}% của 1 năm gần nhất)` : ''}.${moneyVi}${ddVi}`,
          `On risk, 20-session volatility stands at ${vol20.toFixed(1)}% a year${pctl !== null ? ` (${pctl.toFixed(0)}th percentile of the last year)` : ''}.${moneyEn}${ddEn}`,
        ],
      ])
    );
  }

  // 4. Price position vs history.
  if (val) {
    const z = metric(val, 'z1y');
    const pr = metric(val, 'pct52w');
    const ma = metric(val, 'ma200DistPct');
    out.push(
      pick(3, [
        [
          `So với lịch sử, giá đang ở vùng "${lc(val.label!.vi)}"${pr !== null ? ` (phân vị ${pr.toFixed(0)}% của biên độ 52 tuần)` : ''}${ma !== null ? `, cách MA200 ${sgn(ma)}%` : ''}${z !== null ? `, z-score so với trung bình 1 năm là ${sgn(z)}` : ''}.`,
          `Versus its own history, the price sits in the "${lc(val.label!.en)}" zone${pr !== null ? ` (${pr.toFixed(0)}th percentile of the 52-week range)` : ''}${ma !== null ? `, ${sgn(ma)}% from the 200-day average` : ''}${z !== null ? `, with a z-score of ${sgn(z)} against the 1-year mean` : ''}.`,
        ],
        [
          `Xét vị trí trong quá khứ: "${lc(val.label!.vi)}"${pr !== null ? `, phân vị ${pr.toFixed(0)}% trong 52 tuần` : ''}${ma !== null ? `, lệch MA200 ${sgn(ma)}%` : ''}${z !== null ? `, z=${sgn(z)}` : ''}.`,
          `Looking at past levels: "${lc(val.label!.en)}"${pr !== null ? `, ${pr.toFixed(0)}th percentile over 52 weeks` : ''}${ma !== null ? `, ${sgn(ma)}% off the 200-day average` : ''}${z !== null ? `, z=${sgn(z)}` : ''}.`,
        ],
      ])
    );
  }

  // 5. COT (or seasonality when COT is absent).
  if (cot) {
    out.push(
      pick(4, [
        [`Vị thế quỹ (COT): ${lc(cot.label!.vi)}; đây là vị thế đã xảy ra, không phải dự báo.`, `Fund positioning (COT): ${lc(cot.label!.en)}; this is existing positioning, not a forecast.`],
        [`Dữ liệu COT cho thấy ${lc(cot.label!.vi)}; chỉ phản ánh vị thế hiện có của quỹ.`, `COT data shows ${lc(cot.label!.en)}; it only reflects funds' existing positioning.`],
      ])
    );
  } else if (season) {
    out.push([`Mùa vụ: ${lc(season.label!.vi)} (thống kê quá khứ).`, `Seasonality: ${lc(season.label!.en)} (past statistics).`]);
  }

  // 6. Data gaps.
  const missing = card.overall.dimensionsExcluded;
  if (missing.length > 0 || card.dataQuality.level === 'POOR' || card.dataQuality.level === 'UNAVAILABLE') {
    const names: Record<string, Pair> = {
      trend: ['xu hướng', 'trend'], momentum: ['động lượng', 'momentum'], volatility: ['biến động', 'volatility'],
      drawdown: ['mức giảm từ đỉnh', 'drop from high'], cot: ['COT', 'COT'], seasonality: ['mùa vụ', 'seasonality'],
      valuation: ['vị trí giá so với lịch sử', 'price position vs history'],
    };
    const vi = missing.map((m) => names[m]?.[0] ?? m).join(', ');
    const en = missing.map((m) => names[m]?.[1] ?? m).join(', ');
    out.push(
      missing.length > 0
        ? [`Còn thiếu dữ liệu cho: ${vi}; các phần này không được dùng để nhận định.`, `Data is missing for: ${en}; those parts are left out of the reading.`]
        : [`Chất lượng dữ liệu đang ${lc(card.dataQuality.label.vi)}.`, `Data quality is currently ${lc(card.dataQuality.label.en)}.`]
    );
  }
  return out;
}

/** Pure + offline. Both languages pass the recommendation-language post-check. */
export function generateRulesNarrative(
  card: Scorecard,
  inst: Pick<InstrumentDefinition, 'specification'> | null,
  now: Date = new Date()
): ScorecardNarrative {
  const s = buildRulesSentences(card, inst);
  return {
    vi: stripRecommendationLanguage(s.map((p) => p[0]).join(' ')).text,
    en: stripRecommendationLanguage(s.map((p) => p[1]).join(' ')).text,
    provider: 'rules',
    source: RULES_SOURCE,
    generatedAt: now.toISOString(),
  };
}
