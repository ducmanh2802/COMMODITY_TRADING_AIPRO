import type { RadarRating } from '../../../shared/types/radar';

/** Rating sub-score groups, keyed by the component labels produced by server/services/radar/rating.ts. */
export const GROUPS = [
  { id: 'trend', labels: ['Xu hướng ngày', 'Xu hướng tuần', 'Cấu trúc giá'], color: 'var(--series-1)' },
  { id: 'setup', labels: ['Chất lượng thiết lập', 'Động lượng (RSI)'], color: 'var(--accent)' },
  { id: 'risk', labels: ['Biến động (ATR%)', 'Sự kiện sắp tới', 'Vị thế COT'], color: 'var(--warning)' },
  { id: 'data', labels: ['Chất lượng dữ liệu'], color: 'var(--muted)' },
] as const;

/** Bar value of a top-pick card: the rating it is ranked by, else the activity score. */
export function barValue(item: { score: number; rating?: { rating: number } }): number {
  return item.rating ? item.rating.rating : item.score;
}

export function groupScores(rating: RadarRating) {
  return GROUPS.map((g) => {
    const cs = rating.components.filter((c) => (g.labels as readonly string[]).includes(c.label));
    return {
      id: g.id,
      color: g.color,
      points: cs.reduce((a, c) => a + c.points, 0),
      max: cs.reduce((a, c) => a + c.max, 0),
      missing: cs.some((c) => !c.available),
    };
  }).filter((g) => g.max > 0);
}

/** Reward:risk the server already wrote into the setup note ("R:R ước tính 1:2,3"); null when absent. */
export function parseRR(rating: RadarRating | undefined): number | null {
  const note = rating?.components.find((c) => c.label === 'Chất lượng thiết lập')?.note ?? '';
  const m = /R:R[^:]*1:([\d.,]+)/.exec(note);
  if (!m) return null;
  const v = Number(m[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : null;
}