import type { PerformanceHorizonReturns } from '../types/cycle';
import type { Scorecard, ScorecardLevel } from '../types/scorecard';

export type TrendDirection = 'up' | 'down' | 'flat' | 'unavailable';

export type TrendFilter = 'ALL' | 'up' | 'down' | 'flat';

export interface TrendCounts {
  all: number;
  up: number;
  down: number;
  flat: number;
}

export function matchesTrendFilter(direction: TrendDirection, filter: TrendFilter): boolean {
  return filter === 'ALL' ? true : direction === filter;
}

export function countTrendDirections(directions: Iterable<TrendDirection>): TrendCounts {
  const counts: TrendCounts = { all: 0, up: 0, down: 0, flat: 0 };
  for (const d of directions) {
    counts.all++;
    if (d === 'up') counts.up++;
    else if (d === 'down') counts.down++;
    else if (d === 'flat') counts.flat++;
  }
  return counts;
}

export interface InstrumentTrend {
  direction: TrendDirection;
  level: ScorecardLevel | null;
  labelVi: string;
  labelEn: string;
  shortVi: string;
  shortEn: string;
  source: 'scorecard' | 'returns' | 'change' | 'none';
}

const RETURN_DEADBAND_PCT = 0.2;
const CHANGE_DEADBAND_RATIO = 0.002;

/**
 * Resolves the directional trend for an instrument using:
 * 1. Scorecard `trend` dimension (moving-average / price-structure direction),
 * 2. 1-month return percentage (`returns.m1`) when scorecard trend is unavailable,
 * 3. Latest session return ratio (`changePct`) as a final fallback.
 */
export function resolveInstrumentTrend(input: {
  scorecard?: Pick<Scorecard, 'dimensions' | 'price'> | null;
  returns?: Pick<PerformanceHorizonReturns, 'm1' | 'w1'> | null;
  changePct?: number | null;
}): InstrumentTrend {
  const trendDim = input.scorecard?.dimensions.find((d) => d.id === 'trend');
  if (trendDim && trendDim.status === 'OK' && trendDim.level) {
    const level = trendDim.level;
    if (level === 'STRONG_UP' || level === 'UP') {
      const strong = level === 'STRONG_UP';
      return {
        direction: 'up',
        level,
        labelVi: trendDim.label?.vi ?? (strong ? 'Xu hướng tăng mạnh' : 'Xu hướng tăng'),
        labelEn: trendDim.label?.en ?? (strong ? 'Strong uptrend' : 'Uptrend'),
        shortVi: strong ? 'Tăng mạnh' : 'Tăng',
        shortEn: strong ? 'Strong up' : 'Uptrend',
        source: 'scorecard',
      };
    }
    if (level === 'STRONG_DOWN' || level === 'DOWN') {
      const strong = level === 'STRONG_DOWN';
      return {
        direction: 'down',
        level,
        labelVi: trendDim.label?.vi ?? (strong ? 'Xu hướng giảm mạnh' : 'Xu hướng giảm'),
        labelEn: trendDim.label?.en ?? (strong ? 'Strong downtrend' : 'Downtrend'),
        shortVi: strong ? 'Giảm mạnh' : 'Giảm',
        shortEn: strong ? 'Strong down' : 'Downtrend',
        source: 'scorecard',
      };
    }
    if (level === 'SIDEWAYS') {
      return {
        direction: 'flat',
        level,
        labelVi: trendDim.label?.vi ?? 'Đi ngang',
        labelEn: trendDim.label?.en ?? 'Sideways',
        shortVi: 'Đi ngang',
        shortEn: 'Sideways',
        source: 'scorecard',
      };
    }
  }

  const m1 = input.returns?.m1;
  if (typeof m1 === 'number' && Number.isFinite(m1)) {
    if (m1 > RETURN_DEADBAND_PCT) {
      return {
        direction: 'up',
        level: 'UP',
        labelVi: 'Xu hướng tăng (1M)',
        labelEn: 'Uptrend (1M)',
        shortVi: 'Tăng',
        shortEn: 'Up',
        source: 'returns',
      };
    }
    if (m1 < -RETURN_DEADBAND_PCT) {
      return {
        direction: 'down',
        level: 'DOWN',
        labelVi: 'Xu hướng giảm (1M)',
        labelEn: 'Downtrend (1M)',
        shortVi: 'Giảm',
        shortEn: 'Down',
        source: 'returns',
      };
    }
    return {
      direction: 'flat',
      level: 'SIDEWAYS',
      labelVi: 'Đi ngang (1M)',
      labelEn: 'Sideways (1M)',
      shortVi: 'Đi ngang',
      shortEn: 'Sideways',
      source: 'returns',
    };
  }

  const chg = input.changePct ?? input.scorecard?.price?.changePct;
  if (typeof chg === 'number' && Number.isFinite(chg)) {
    if (chg > CHANGE_DEADBAND_RATIO) {
      return {
        direction: 'up',
        level: 'UP',
        labelVi: 'Tăng phiên gần nhất',
        labelEn: 'Up on latest session',
        shortVi: 'Tăng',
        shortEn: 'Up',
        source: 'change',
      };
    }
    if (chg < -CHANGE_DEADBAND_RATIO) {
      return {
        direction: 'down',
        level: 'DOWN',
        labelVi: 'Giảm phiên gần nhất',
        labelEn: 'Down on latest session',
        shortVi: 'Giảm',
        shortEn: 'Down',
        source: 'change',
      };
    }
    return {
      direction: 'flat',
      level: 'SIDEWAYS',
      labelVi: 'Đi ngang phiên gần nhất',
      labelEn: 'Flat on latest session',
      shortVi: 'Đi ngang',
      shortEn: 'Flat',
      source: 'change',
    };
  }

  return {
    direction: 'unavailable',
    level: null,
    labelVi: 'Chưa đủ dữ liệu xu hướng',
    labelEn: 'Trend unavailable',
    shortVi: '—',
    shortEn: '—',
    source: 'none',
  };
}
