/** Clamp a 0-100 score for bar width; non-finite becomes 0. */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

/** Filled dots (0-3) for a data-quality level. */
export function qualityDotCount(level: string): number {
  return level === 'GOOD' ? 3 : level === 'LIMITED' ? 2 : level === 'POOR' ? 1 : 0;
}
