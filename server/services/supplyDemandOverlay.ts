/**
 * T60 — fills the "Ma trận Cung – Cầu" rows with real, sourced numbers where the app already has (or can
 * freely fetch) them: USDA WASDE, EIA, USDA FAS export sales, USDA ERS costs, CFTC COT.
 * Every value carries source + as-of + quality; anything unavailable stays a plain-Vietnamese hint
 * (never a made-up number). Descriptive only — no trade advice.
 */
import type { MacroDatapoint } from '../../src/shared/types/macro.ts';
import type { TailoredSupplyDemandItem } from '../../src/shared/types/cycle.ts';
import type { SupplyDemandBlueprintItem } from '../../src/shared/data/commodityResearchCatalog.ts';
import type { MacroService } from '../macro/service.ts';
import { FAS_KEY_URL } from '../macro/supplySources.ts';

export type SupplyMacroLike = Pick<MacroService, 'getWasde' | 'getEia' | 'getEthanol' | 'getExportSales' | 'getErsCosts'>;

export type SdCommodity = 'CORN' | 'SOYBEAN' | 'WHEAT';

export interface CotLike {
  available: boolean;
  reportDate: string | null;
  managedMoneyNet: number | null;
  managedMoneyNetPctOi: number | null;
  cotIndex: number | null;
}

export function sdCommodityOf(instrumentId: string): SdCommodity | null {
  const root = instrumentId.trim().toUpperCase().split(':').pop() ?? '';
  if (root === 'ZC') return 'CORN';
  if (root === 'ZS' || root === 'ZM' || root === 'ZL') return 'SOYBEAN';
  if (root === 'ZW') return 'WHEAT';
  return null;
}

export function fmtNum(n: number, maxFrac = 0): string {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: maxFrac, minimumFractionDigits: 0 });
}

/** Spells the source's English unit out in Vietnamese words. */
export function viUnit(unit: string): string {
  const u = unit.toLowerCase();
  const scale = u.includes('million') ? 'triệu ' : u.includes('thousand') ? 'nghìn ' : '';
  if (u.includes('bushel') && u.includes('per')) return 'USD/giạ (bushel)';
  if (u.includes('dollars per bushel')) return 'USD/giạ (bushel)';
  if (u.includes('barrels per day')) return `${scale}thùng/ngày`;
  if (u.includes('barrel')) return `${scale}thùng`;
  if (u.includes('bushel')) return `${scale}giạ (bushel)`;
  if (u.includes('metric tons per week')) return 'tấn/tuần';
  if (u.includes('metric ton')) return `${scale}tấn`;
  if (u === '%') return '%';
  return unit;
}

function change(cur: number, prev: number | null | undefined, when: string, frac: number) {
  if (prev === null || prev === undefined || !Number.isFinite(prev)) return { changeText: null, changeDir: null } as const;
  const diff = cur - prev;
  const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : null;
  const dir = pct !== null && Math.abs(pct) < 0.05 ? 'FLAT' : diff > 0 ? 'UP' : diff < 0 ? 'DOWN' : 'FLAT';
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  const body = `${sign}${fmtNum(Math.abs(diff), frac)}${pct !== null ? ` (${sign}${fmtNum(Math.abs(pct), 1)}%)` : ''}`;
  return { changeText: dir === 'FLAT' ? `Không đổi so với ${when}` : `${body} so với ${when}`, changeDir: dir } as const;
}

type Partial_ = Partial<TailoredSupplyDemandItem>;

/** Item fields for one datapoint (OK) or the friendly "no value" explanation. */
function fromDatapoint(
  dp: MacroDatapoint,
  opts: { prevWhen: string; frac: number; extras?: (d: MacroDatapoint) => Array<{ label: string; value: string }>; keyName?: string; keyUrl?: string; webHint?: string }
): Partial_ {
  const common = {
    sourceName: dp.sourceName,
    sourceUrl: dp.sourceUrl,
    sourceQuality: dp.sourceQuality,
    dataStatus: dp.status,
  };
  if (dp.value === null || (dp.status !== 'CURRENT' && dp.status !== 'DELAYED' && dp.status !== 'HISTORICAL' && dp.status !== 'STALE')) {
    const needsKey = !!opts.keyName && /not configured/i.test(dp.reason ?? '');
    const hintVi = needsKey
      ? `Chưa có số liệu tự động — cần khoá ${opts.keyName} (miễn phí, đăng ký tại ${opts.keyUrl}) rồi khai báo trong file .env.`
      : `Nguồn chính thức tạm thời chưa trả dữ liệu hợp lệ${opts.webHint ? ` — xem trực tiếp tại ${opts.webHint}` : ''}. Hệ thống sẽ tự thử lại.`;
    return {
      ...common,
      state: needsKey ? 'NEEDS_KEY' : 'UNAVAILABLE',
      latestValue: null,
      previousValue: null,
      period: null,
      asOf: null,
      impact: 'UNAVAILABLE',
      hintVi,
      notes: hintVi,
    };
  }
  const ch = change(dp.value, dp.previousValue, opts.prevWhen, opts.frac);
  const unit = viUnit(dp.unit);
  return {
    ...common,
    state: 'OK',
    unit,
    latestValue: dp.value,
    previousValue: dp.previousValue ?? null,
    period: dp.asOf,
    asOf: dp.asOf,
    valueText: `${fmtNum(dp.value, opts.frac)} ${unit}`,
    ...ch,
    impact: 'UNCERTAIN',
    extras: opts.extras?.(dp),
    notes: `Nguồn: ${dp.sourceName}${dp.asOf ? ` · kỳ số liệu: ${dp.asOf}` : ''} · chất lượng: ${dp.sourceQuality}/${dp.status}.`,
  };
}

const ERS_ID = { CORN: 'ERS_BREAKEVEN_CORN', SOYBEAN: 'ERS_BREAKEVEN_SOYBEAN', WHEAT: 'ERS_BREAKEVEN_WHEAT' } as const;
const WASDE_ID = {
  CORN: 'WASDE_US_CORN_ENDING_STOCKS',
  SOYBEAN: 'WASDE_US_SOYBEAN_ENDING_STOCKS',
  WHEAT: 'WASDE_US_WHEAT_ENDING_STOCKS',
} as const;

const wasdeExtras = (d: MacroDatapoint) => {
  const x = d.details;
  if (!x || x.stocksToUsePct === undefined) return [];
  const prev = x.previousStocksToUsePct !== undefined ? `; dự báo tháng trước ${fmtNum(x.previousStocksToUsePct, 1)}%` : '';
  return [{ label: 'Tỷ lệ tồn kho/tiêu thụ (Mỹ)', value: `${fmtNum(x.stocksToUsePct, 1)}%${prev} — tính = tồn kho cuối kỳ ÷ tổng tiêu thụ trong báo cáo WASDE` }];
};

async function resolveSlot(
  slot: NonNullable<SupplyDemandBlueprintItem['slot']>,
  c: SdCommodity | null,
  macro: SupplyMacroLike
): Promise<Partial_ | null> {
  switch (slot) {
    case 'WASDE':
    case 'STU': {
      if (!c) return null;
      const w = await macro.getWasde();
      const dp = w.keyNumbers.find((k) => k.id === WASDE_ID[c]);
      if (!dp) return null;
      if (slot === 'WASDE') {
        return fromDatapoint(dp, { prevWhen: 'dự báo tháng trước', frac: 0, extras: wasdeExtras, webHint: 'https://www.usda.gov/oce/commodity/wasde' });
      }
      const stu = dp.details?.stocksToUsePct;
      if (dp.value === null || stu === undefined) {
        return fromDatapoint({ ...dp, value: null }, { prevWhen: '', frac: 1, webHint: 'https://www.usda.gov/oce/commodity/wasde' });
      }
      return fromDatapoint(
        { ...dp, unit: '%', value: stu, previousValue: dp.details?.previousStocksToUsePct ?? null },
        { prevWhen: 'dự báo tháng trước', frac: 1 }
      );
    }
    case 'ETHANOL':
      return fromDatapoint(await macro.getEthanol(), {
        prevWhen: 'tuần trước',
        frac: 0,
        keyName: 'EIA_API_KEY',
        keyUrl: 'https://www.eia.gov/opendata/register.php',
        webHint: 'https://www.eia.gov/petroleum/ethanol/',
      });
    case 'EXPORT': {
      if (!c) return null;
      return fromDatapoint(await macro.getExportSales(c), {
        prevWhen: 'tuần trước',
        frac: 0,
        keyName: 'FAS_API_KEY',
        keyUrl: FAS_KEY_URL,
        webHint: 'https://apps.fas.usda.gov/export-sales/esrd1.html',
        extras: (d) =>
          d.details
            ? [
                { label: 'Luỹ kế xuất khẩu niên vụ này', value: `${fmtNum(d.details.accumulatedExports)} tấn` },
                { label: 'Hợp đồng đã bán chưa giao', value: `${fmtNum(d.details.outstandingSales)} tấn` },
              ]
            : [],
      });
    }
    case 'COST': {
      if (!c) return null;
      return fromDatapoint(await macro.getErsCosts(c), {
        prevWhen: 'năm trước',
        frac: 2,
        webHint: 'https://www.ers.usda.gov/data-products/commodity-costs-and-returns',
        extras: (d) => {
          const x = d.details;
          if (!x) return [];
          const out = [
            { label: 'Chi phí đầy đủ trên mỗi mẫu Anh trồng', value: `${fmtNum(x.costPerAcre, 0)} USD` },
            { label: 'Năng suất', value: `${fmtNum(x.yieldBuPerAcre, 0)} giạ/mẫu Anh trồng` },
          ];
          if (x.operatingCostPerBushel !== undefined) out.push({ label: 'Riêng chi phí vận hành', value: `${fmtNum(x.operatingCostPerBushel, 2)} USD/giạ` });
          if (x.priceReceivedPerBushel !== undefined) out.push({ label: 'Giá nông dân nhận (ERS, cùng năm)', value: `${fmtNum(x.priceReceivedPerBushel, 2)} USD/giạ` });
          return out;
        },
      });
    }
    case 'EIA_CRUDE': {
      const g = await macro.getEia();
      const dp = g.items.find((i) => i.id === 'EIA_CRUDE_EX_SPR');
      if (!dp) return null;
      return fromDatapoint(dp, {
        prevWhen: 'tuần trước',
        frac: 0,
        keyName: 'EIA_API_KEY',
        keyUrl: 'https://www.eia.gov/opendata/register.php',
        webHint: 'https://www.eia.gov/petroleum/supply/weekly/',
      });
    }
  }
}

/** Default (no live source) presentation for a blueprint row. */
export function baselineItemHint(bp: SupplyDemandBlueprintItem): Partial_ & { notes: string } {
  if (bp.link) {
    const hintVi = `Nguồn chỉ có trên web, chưa có bản tải tự động — xem tại ${bp.link}`;
    return { state: 'LINK_ONLY', hintVi, notes: hintVi, sourceUrl: bp.link, sourceName: bp.sourceHint };
  }
  const hintVi = `Chưa có nguồn miễn phí tự động cho chỉ tiêu này (nguồn tham khảo: ${bp.sourceHint}).`;
  return { state: 'UNAVAILABLE', hintVi, notes: hintVi };
}

/**
 * Applies live data to rows whose blueprint has a `slot`. Rows already filled from the fundamental store
 * (latestValue !== null) are left alone. Never throws: a failing source degrades to a friendly hint.
 */
export async function enrichSupplyDemandItems(
  items: TailoredSupplyDemandItem[],
  blueprint: SupplyDemandBlueprintItem[],
  instrumentId: string,
  macro: SupplyMacroLike | null | undefined
): Promise<TailoredSupplyDemandItem[]> {
  const c = sdCommodityOf(instrumentId);
  return Promise.all(
    items.map(async (item) => {
      const bp = blueprint.find((b) => b.id === item.id);
      if (!bp?.slot || item.latestValue !== null) return item;
      // Rice (ZR) shares the wheat blueprint but WASDE/FAS/ERS wheat numbers do not describe it.
      if (!c && bp.slot !== 'ETHANOL' && bp.slot !== 'EIA_CRUDE') return item;
      if (!macro) return item;
      try {
        const patch = await resolveSlot(bp.slot, c, macro);
        return patch ? { ...item, ...patch } : item;
      } catch {
        return item;
      }
    })
  );
}

export function cotRow(cot: CotLike): TailoredSupplyDemandItem | null {
  if (!cot.available || cot.managedMoneyNet === null) return null;
  return {
    id: 'cot_managed_money',
    label: 'CFTC COT Managed Money Net Position',
    labelVi: 'Vị thế ròng của quỹ đầu cơ (CFTC COT)',
    unit: 'hợp đồng',
    sourceHint: 'CFTC Commitments of Traders',
    latestValue: cot.managedMoneyNet,
    previousValue: null,
    period: cot.reportDate,
    impact: 'UNCERTAIN',
    state: 'OK',
    valueText: `${fmtNum(cot.managedMoneyNet)} hợp đồng ròng${cot.managedMoneyNetPctOi !== null ? ` (${fmtNum(cot.managedMoneyNetPctOi, 1)}% lượng mở)` : ''}`,
    changeText: null,
    changeDir: null,
    asOf: cot.reportDate,
    sourceName: 'CFTC Commitments of Traders (Disaggregated)',
    sourceUrl: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm',
    sourceQuality: 'OFFICIAL',
    dataStatus: 'HISTORICAL',
    extras: cot.cotIndex !== null ? [{ label: 'COT Index (52 tuần)', value: `${fmtNum(cot.cotIndex, 1)}%` }] : [],
    supportHintVi: 'Vị thế đầu cơ rất lớn hoặc rất nhỏ thường đi kèm biến động mạnh khi vị thế được đảo lại.',
    notes: 'Nguồn: CFTC COT (báo cáo thứ Ba, công bố thứ Sáu).',
  };
}
