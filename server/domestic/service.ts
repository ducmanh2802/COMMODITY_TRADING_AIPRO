/**
 * Builds the domestic-vs-international price overview (latest per commodity + 90-day history + basis).
 * International side: stored D1 CONTINUOUS candles (from the owner's import / Yahoo opt-in sync), converted with
 * the latest VCB USD/VND. One FX rate is applied to the whole history (no FX history source) — flagged in output.
 */
import {
  DOMESTIC_COMMODITIES,
  INTL_REFERENCE,
  computeBasis,
  domesticToVndPerKg,
  intlToVndPerKg,
  type Basis,
  type DomesticCommodity,
  type DomesticPricePoint,
} from '../../src/shared/domestic/basis.ts';
import type { ICandleRepository } from '../storage/candleRepository.ts';
import type { DomesticRepositoryLike } from './repository.ts';

export const DOMESTIC_HISTORY_DAYS = 90;

export interface FxInfo {
  usdVnd: number;
  asOf: string | null;
  source: string;
  sourceUrl: string;
  status: string;
}

export interface DomesticOverviewItem {
  commodity: DomesticCommodity;
  latest: DomesticPricePoint | null;
  latestVndPerKg: number | null;
  intl: { instrumentId: string; value: number; unit: string; asOf: string; vndPerKg: number | null } | null;
  basis: Basis | null;
  history: Array<{ date: string; domesticVndPerKg: number | null; intlVndPerKg: number | null }>;
}

export interface DomesticOverview {
  generatedAt: string;
  historyDays: number;
  fx: FxInfo | null;
  fxNote: string;
  items: DomesticOverviewItem[];
}

export interface DomesticServiceDeps {
  repo: DomesticRepositoryLike;
  candles?: ICandleRepository | null;
  macro?: { getFx(): Promise<{ items: Array<{ id: string; value: number | null; asOf: string | null; sourceName: string; sourceUrl: string; status: string }> }> } | null;
  now?: () => Date;
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function buildDomesticOverview(deps: DomesticServiceDeps): Promise<DomesticOverview> {
  const now = (deps.now ?? (() => new Date()))();
  const since = isoDate(now.getTime() - DOMESTIC_HISTORY_DAYS * 86400000);

  let fx: FxInfo | null = null;
  try {
    const g = await deps.macro?.getFx();
    const vcb = g?.items.find((i) => i.id === 'USDVND_VCB');
    if (vcb && typeof vcb.value === 'number' && vcb.value > 0) {
      fx = { usdVnd: vcb.value, asOf: vcb.asOf, source: vcb.sourceName, sourceUrl: vcb.sourceUrl, status: vcb.status };
    }
  } catch {
    fx = null;
  }

  const items: DomesticOverviewItem[] = [];
  for (const commodity of DOMESTIC_COMMODITIES) {
    const latest = deps.repo.latest(commodity);
    const ref = INTL_REFERENCE[commodity];
    let candles: Array<{ date: string; close: number }> = [];
    if (ref && deps.candles) {
      try {
        const res = await deps.candles.queryCandles(
          { instrumentId: ref.instrumentId, contractCode: 'CONTINUOUS', timeframe: 'D1' },
          { fromMs: Date.parse(`${since}T00:00:00Z`) - 10 * 86400000, limit: 400 }
        );
        candles = res.rows.map((r) => ({ date: isoDate(r.timestampMs), close: r.close }));
      } catch {
        candles = [];
      }
    }
    const intlAtOrBefore = (date: string): { date: string; close: number } | null => {
      let found: { date: string; close: number } | null = null;
      for (const c of candles) {
        if (c.date <= date) found = c;
        else break;
      }
      return found;
    };
    const fxRate = fx?.usdVnd ?? null;
    const convIntl = (close: number) => (ref && fxRate ? intlToVndPerKg(close, ref.unit, fxRate) : null);

    let history: DomesticOverviewItem['history'] = [];
    if (latest) {
      history = deps.repo.history(commodity, latest.region, since).map((p) => ({
        date: p.date,
        domesticVndPerKg: domesticToVndPerKg(p.price, p.unit, fxRate),
        intlVndPerKg: (() => {
          const c = intlAtOrBefore(p.date);
          return c ? convIntl(c.close) : null;
        })(),
      }));
    }

    const latestVnd = latest ? domesticToVndPerKg(latest.price, latest.unit, fxRate) : null;
    const lc = latest ? intlAtOrBefore(latest.date) : null;
    const intl =
      ref && lc ? { instrumentId: ref.instrumentId, value: lc.close, unit: ref.unit, asOf: lc.date, vndPerKg: convIntl(lc.close) } : null;
    const basis = latestVnd !== null && intl?.vndPerKg != null ? computeBasis(latestVnd, intl.vndPerKg) : null;
    items.push({ commodity, latest, latestVndPerKg: latestVnd, intl, basis, history });
  }

  return {
    generatedAt: now.toISOString(),
    historyDays: DOMESTIC_HISTORY_DAYS,
    fx,
    fxNote:
      'Quy đổi dùng tỷ giá USD/VND (VCB) mới nhất cho toàn bộ chuỗi; giá quốc tế lấy từ dữ liệu nến đã nhập, gần nhất không muộn hơn ngày của giá trong nước.',
    items,
  };
}
