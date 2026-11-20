/**
 * "Radar thị trường sôi động" (T64): ranks instruments by a 0-100 activity score built from measurable daily-bar
 * facts, plus a separate descriptive "setups worth studying" list. Never fabricates: missing inputs lower coverage
 * and are listed in `caveats`.
 */
import type { CycleMarketOverview } from '../../../src/shared/types/cycle.ts';
import type { InstrumentDefinition } from '../../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../../src/shared/types/market.ts';
import type { RadarEvent, RadarItem, RadarResponse, RadarSetup } from '../../../src/shared/types/radar.ts';
import { addDays, weekdayDates } from '../drivers/math.ts';
import type { DriversDeps } from '../drivers/service.ts';
import { detectSetup, scoreInstrument, setupDescription, setupRisks, toBars } from './scoring.ts';

export const RADAR_TTL_MS = 5 * 60_000;
export const RADAR_DISCLAIMER =
  'Radar chỉ mô tả mức độ sôi động và các điều kiện kỹ thuật đo được từ dữ liệu giá, phục vụ nghiên cứu. Đây không phải lời khuyên đầu tư và không hứa hẹn lợi nhuận.';
const STALE_BAR_DAYS = 7;
const SPARK_BARS = 30;

export interface RadarHistory {
  candles: MarketCandle[];
  source: string | null;
  quality: string | null;
}
export interface RadarDeps {
  listInstruments: () => Promise<InstrumentDefinition[]>;
  getHistory: (inst: InstrumentDefinition) => Promise<RadarHistory>;
  getCycle?: (() => Promise<CycleMarketOverview | null>) | null;
  getWasde?: DriversDeps['getWasde'];
  now?: () => Date;
}
/** Remembers the previous cycle phase per instrument between computations (for the "phase changed" signal). */
export interface RadarState {
  phases: Map<string, string>;
}
export const createRadarState = (): RadarState => ({ phases: new Map() });

const CATEGORY_VI: Record<string, string> = { AGRICULTURE: 'Nông sản', SOFT_COMMODITIES: 'Hàng mềm', METALS: 'Kim loại', ENERGY: 'Năng lượng' };

/** Upcoming reports in [from, to]: WASDE (official dates), EIA Wednesdays for energy, COT Fridays. */
export function buildEvents(
  from: string,
  to: string,
  wasdeDates: string[],
  categories: Set<string>,
): RadarEvent[] {
  const out: RadarEvent[] = [];
  if (categories.has('AGRICULTURE'))
    for (const d of wasdeDates)
      if (d >= from && d <= to) out.push({ date: d, kind: 'WASDE', label: 'Báo cáo WASDE (USDA)', scope: 'AGRICULTURE', source: 'USDA ESMIS', scheduled: 'official' });
  if (categories.has('ENERGY'))
    for (const d of weekdayDates(from, to, 3))
      out.push({ date: d, kind: 'EIA', label: 'Tồn kho dầu thô EIA (hằng tuần)', scope: 'ENERGY', source: 'EIA (lịch tuần, có thể lệch khi nghỉ lễ)', scheduled: 'weekly-rule' });
  for (const d of weekdayDates(from, to, 5))
    out.push({ date: d, kind: 'COT', label: 'Báo cáo vị thế COT của CFTC (hằng tuần)', scope: 'ALL', source: 'CFTC (lịch tuần, có thể lệch khi nghỉ lễ)', scheduled: 'weekly-rule' });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind < b.kind ? -1 : 1));
}

/** Major (non-COT) report that affects `category` within `days` days of `today`. */
export function eventSoonFor(events: RadarEvent[], category: string, today: string, days = 3): string | null {
  const to = addDays(today, days);
  const hit = events.find((e) => e.kind !== 'COT' && e.scope === category && e.date >= today && e.date <= to);
  return hit ? `${hit.label} (${hit.date})` : null;
}

/** Money value of one ATR move per contract from tick size/value; null unless both are known and positive. */
export function atrMoney(inst: InstrumentDefinition, atr: number | null): { value: number; currency: string } | null {
  const { minimumTickSize: tick, tickValue, tradingCurrency } = inst.specification;
  if (atr === null || !(atr > 0) || tick === null || tickValue === null || !(tick > 0) || !(tickValue > 0)) return null;
  return { value: (atr / tick) * tickValue, currency: tradingCurrency };
}

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export async function buildRadar(deps: RadarDeps, state: RadarState = createRadarState()): Promise<RadarResponse> {
  const now = (deps.now ?? (() => new Date()))();
  const today = now.toISOString().slice(0, 10);
  const caveats: string[] = [];
  const all = await deps.listInstruments();
  const seen = new Set<string>();
  const insts = all.filter((i) => i.enabled !== false && !seen.has(i.exchangeSymbol) && seen.add(i.exchangeSymbol));

  const [cycle, wasde] = await Promise.all([
    deps.getCycle ? deps.getCycle().catch(() => null) : Promise.resolve(null),
    deps.getWasde ? deps.getWasde().catch(() => null) : Promise.resolve(null),
  ]);
  if (!cycle) caveats.push('Không đọc được tổng quan chu kỳ: bỏ qua tín hiệu COT và đổi pha.');
  const cycleById = new Map((cycle?.commodities ?? []).map((c) => [c.instrument.id, c]));
  if (deps.getWasde && !wasde) caveats.push('Không đọc được lịch WASDE chính thức: không ước tính ngày.');
  const wasdeDates = (wasde?.upcoming ?? []).map((r) => r.releasedAt?.slice(0, 10)).filter((d): d is string => !!d);
  const events = buildEvents(today, addDays(today, 7), wasdeDates, new Set(insts.map((i) => i.category)));
  const eventsNear = buildEvents(today, addDays(today, 3), wasdeDates, new Set(insts.map((i) => i.category)));

  const items: RadarItem[] = [];
  const setups: RadarSetup[] = [];
  let noHistory = 0;
  let stale = 0;
  const queue = [...insts];
  const worker = async () => {
    for (let inst = queue.shift(); inst; inst = queue.shift()) {
      let h: RadarHistory;
      try {
        h = await deps.getHistory(inst);
      } catch {
        noHistory++;
        continue;
      }
      const bars = toBars(h.candles);
      if (bars.close.length < 22) {
        noHistory++;
        continue;
      }
      const asOf = bars.dates[bars.dates.length - 1];
      if (daysBetween(asOf, today) > STALE_BAR_DAYS) {
        stale++;
        continue;
      }
      const cs = cycleById.get(inst.id);
      const eventSoon = eventSoonFor(eventsNear, inst.category, today);
      const phaseNow = cs ? cs.cyclePhase : null;
      const res = scoreInstrument({
        bars,
        cotIndex: cs && typeof cs.cotIndex === 'number' ? cs.cotIndex : null,
        eventSoon,
        phaseNow,
        phasePrev: state.phases.get(inst.id) ?? null,
        phaseLabelNow: cs?.cyclePhaseLabelVi ?? null,
      });
      if (phaseNow) state.phases.set(inst.id, phaseNow);
      const name = inst.commodityProfile?.vietnameseName ?? inst.productName;
      items.push({
        id: inst.id,
        symbol: inst.exchangeSymbol,
        name,
        category: CATEGORY_VI[inst.category] ?? inst.category,
        score: res.score,
        signals: res.signals,
        reasons: res.signals.filter((s) => s.active && s.reason).sort((a, b) => b.points - a.points).map((s) => s.reason as string),
        breakouts: res.breakouts,
        lastClose: bars.close[bars.close.length - 1],
        changePct: res.changePct === null ? null : Math.round(res.changePct * 100) / 100,
        asOf,
        source: h.source,
        quality: h.quality,
        spark: bars.close.slice(-SPARK_BARS),
        caveats: res.caveats,
      });
      const core = detectSetup(bars);
      if (core) {
        const money = atrMoney(inst, res.atr);
        setups.push({
          id: inst.id,
          symbol: inst.exchangeSymbol,
          name,
          direction: core.direction,
          description: setupDescription(core),
          conditions: core.conditions,
          risks: setupRisks({ atrMoney: money?.value ?? null, currency: money?.currency ?? null, eventSoon }),
          atrMoney: money ? Math.round(money.value) : null,
          currency: money?.currency ?? null,
          asOf,
          source: h.source,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, insts.length) }, worker));

  items.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  setups.sort((a, b) => a.symbol.localeCompare(b.symbol));
  if (noHistory > 0) caveats.push(`${noHistory} mã chưa có đủ lịch sử giá ngày (cần tối thiểu 22 phiên) nên không được chấm điểm.`);
  if (stale > 0) caveats.push(`${stale} mã có phiên giá cuối cũ hơn ${STALE_BAR_DAYS} ngày nên bị loại khỏi bảng xếp hạng.`);
  const noVol = items.filter((i) => i.signals.find((s) => s.id === 'volume')?.value === null).length;
  if (noVol > 0) caveats.push(`${noVol}/${items.length} mã không có dữ liệu khối lượng (nguồn miễn phí/không chính thức có thể thiếu), điểm của các mã này thiếu thành phần khối lượng.`);
  caveats.push('Dữ liệu giá ngày từ kho lưu trữ hoặc nguồn không chính thức, có thể chậm 15 phút trở lên; điểm tính trên phiên ngày gần nhất.');

  return {
    asOf: now.toISOString(),
    items,
    setups,
    events,
    caveats,
    disclaimer: RADAR_DISCLAIMER,
    instrumentsTotal: insts.length,
    instrumentsScored: items.length,
  };
}
