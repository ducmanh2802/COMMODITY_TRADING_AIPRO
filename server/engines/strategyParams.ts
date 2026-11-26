/**
 * Typed, bounded parameter schemas for the 8 deterministic strategies.
 * Defaults reproduce the previously hard-coded thresholds exactly, so a request without `params`
 * behaves as before. Validation is strict: unknown keys, non-finite numbers and out-of-range values
 * are rejected (never silently clamped).
 */
import type { StrategyId } from '../../src/shared/types/analysis.ts';

export interface StrategyParamDef {
  key: string;
  /** Vietnamese label shown next to the input. */
  label: string;
  /** Vietnamese one-line hint. */
  hint: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export type StrategyParams = Record<string, number>;

const slAtrMult = (def: number): StrategyParamDef => ({
  key: 'slAtrMult',
  label: 'Khoảng cắt lỗ (x ATR)',
  hint: 'Cắt lỗ cách giá vào bao nhiêu lần ATR. Càng lớn càng ít bị quét nhưng mỗi lệnh lỗ nặng hơn.',
  min: 0.5,
  max: 4,
  step: 0.05,
  default: def,
});

const tp1R: StrategyParamDef = {
  key: 'tp1R',
  label: 'Chốt lời (x khoảng lỗ)',
  hint: 'Mục tiêu chốt lời bằng bao nhiêu lần khoảng cắt lỗ (R).',
  min: 0.5,
  max: 5,
  step: 0.1,
  default: 1.5,
};

export const STRATEGY_PARAM_SCHEMAS: Record<StrategyId, StrategyParamDef[]> = {
  TREND_FOLLOWING: [
    { key: 'adxMin', label: 'ADX tối thiểu', hint: 'Chỉ vào lệnh khi xu hướng đủ mạnh (ADX từ ngưỡng này trở lên).', min: 10, max: 40, step: 1, default: 22 },
    slAtrMult(1.5),
    tp1R,
  ],
  EMA_PULLBACK: [
    { key: 'pullbackAtr', label: 'Biên hồi về EMA20 (x ATR)', hint: 'Giá được phép cách EMA20 tối đa bấy nhiêu lần ATR để coi là nhịp hồi.', min: 0.25, max: 2, step: 0.05, default: 0.75 },
    slAtrMult(1.25),
    tp1R,
  ],
  BREAKOUT: [slAtrMult(1.2), tp1R],
  RANGE_TRADING: [
    { key: 'adxMax', label: 'ADX tối đa (đi ngang)', hint: 'Chỉ giao dịch biên khi ADX thấp hơn ngưỡng này.', min: 12, max: 35, step: 1, default: 24 },
    { key: 'rsiLow', label: 'RSI quá bán (mua)', hint: 'Mua khi RSI từ ngưỡng này trở xuống; bán khống đối xứng (100 trừ ngưỡng).', min: 20, max: 49, step: 1, default: 40 },
    slAtrMult(1.2),
    tp1R,
  ],
  SR_REVERSAL: [
    { key: 'proximityAtr', label: 'Độ gần vùng hỗ trợ/kháng cự (x ATR)', hint: 'Nến phải chạm vùng trong khoảng này (tính theo ATR) mới tính là đảo chiều.', min: 0.1, max: 1.5, step: 0.05, default: 0.5 },
    slAtrMult(1.2),
    tp1R,
  ],
  RSI_REVERSAL: [
    { key: 'rsiOversold', label: 'RSI quá bán (mua)', hint: 'Mua khi RSI từ ngưỡng này trở xuống; bán khống đối xứng (100 trừ ngưỡng).', min: 15, max: 45, step: 1, default: 32 },
    slAtrMult(1.3),
    tp1R,
  ],
  MACD_MOMENTUM: [slAtrMult(1.5), tp1R],
  ATR_VOLATILITY_BREAKOUT: [
    { key: 'rangeAtrMult', label: 'Biên độ nến tối thiểu (x ATR)', hint: 'Nến phải có biên độ từ ngưỡng này (tính theo ATR) mới là bứt phá biến động.', min: 0.8, max: 3, step: 0.05, default: 1.25 },
    slAtrMult(1.5),
    tp1R,
  ],
  TSMOM_12M: [
    { key: 'lookback', label: 'Số phiên nhìn lại', hint: 'Lợi suất quá khứ đo trên bấy nhiêu phiên (252 phiên ngày ~ 12 tháng).', min: 20, max: 252, step: 1, default: 252 },
    slAtrMult(2),
    { ...tp1R, default: 3 },
  ],
  DONCHIAN_BREAKOUT: [
    { key: 'entryN', label: 'Kênh vào lệnh (N phiên)', hint: 'Vào lệnh khi giá đóng cửa vượt đỉnh/đáy của N phiên trước đó.', min: 5, max: 55, step: 1, default: 20 },
    { key: 'exitN', label: 'Kênh thoát (N phiên)', hint: 'Mức cắt lỗ đặt tại đáy/đỉnh của N phiên gần nhất (kênh thoát).', min: 3, max: 50, step: 1, default: 10 },
    { ...tp1R, default: 3 },
  ],
};

export function getParamSchema(strategyId: StrategyId): StrategyParamDef[] {
  return STRATEGY_PARAM_SCHEMAS[strategyId] ?? [];
}

export function defaultParams(strategyId: StrategyId): StrategyParams {
  return Object.fromEntries(getParamSchema(strategyId).map((d) => [d.key, d.default]));
}

export type ParamValidation = { ok: true; params: StrategyParams } | { ok: false; errors: string[] };

/** Validate partial user input against the schema; missing keys take the default. */
export function validateStrategyParams(strategyId: StrategyId, input: unknown): ParamValidation {
  const schema = getParamSchema(strategyId);
  const defaults = defaultParams(strategyId);
  if (input === undefined || input === null) return { ok: true, params: defaults };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['params must be an object of numbers.'] };
  }
  const errors: string[] = [];
  const out: StrategyParams = { ...defaults };
  const known = new Map(schema.map((d) => [d.key, d]));
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const def = known.get(key);
    if (!def) {
      errors.push(`Unknown parameter "${key}" for ${strategyId}.`);
      continue;
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      errors.push(`Parameter "${key}" must be a finite number.`);
      continue;
    }
    if (raw < def.min || raw > def.max) {
      errors.push(`Parameter "${key}" must be between ${def.min} and ${def.max} (got ${raw}).`);
      continue;
    }
    out[key] = raw;
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, params: out };
}
