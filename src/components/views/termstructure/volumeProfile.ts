/**
 * T95: volume-by-price profile approximated from daily bars. Each bar's volume is spread uniformly over the
 * price buckets its [low, high] range touches (proportional to overlap). POC = bucket with the most volume;
 * value area = smallest contiguous set of buckets around the POC holding >= `valueAreaPct` of total volume.
 * Bars without a positive volume are skipped (never invented) and counted.
 */
export interface ProfileBar {
  timestamp: string;
  high: number;
  low: number;
  volume: number | null;
}

export interface ProfileBucket {
  low: number;
  high: number;
  volume: number;
}

export interface VolumeProfile {
  buckets: ProfileBucket[];
  pocIndex: number;
  /** Inclusive bucket index range of the value area. */
  vaLowIndex: number;
  vaHighIndex: number;
  vaLow: number;
  vaHigh: number;
  poc: number;
  totalVolume: number;
  usedBars: number;
  skippedBars: number;
}

export function windowStartIso(lastIso: string, months: number): string {
  const d = new Date(lastIso);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

export function computeVolumeProfile(
  bars: ProfileBar[],
  opts: { buckets?: number; valueAreaPct?: number } = {}
): VolumeProfile | null {
  const n = Math.max(2, Math.min(200, Math.floor(opts.buckets ?? 24)));
  const pct = opts.valueAreaPct ?? 0.7;
  const good = bars.filter(
    (b) => b.volume !== null && b.volume > 0 && Number.isFinite(b.high) && Number.isFinite(b.low) && b.high >= b.low
  );
  const skippedBars = bars.length - good.length;
  if (good.length === 0) return null;
  const lo = Math.min(...good.map((b) => b.low));
  const hi = Math.max(...good.map((b) => b.high));
  if (!(hi > lo)) return null;
  const step = (hi - lo) / n;
  const vols = new Array<number>(n).fill(0);
  for (const b of good) {
    const vol = b.volume as number;
    if (b.high === b.low) {
      vols[Math.min(n - 1, Math.floor((b.low - lo) / step))] += vol;
      continue;
    }
    const range = b.high - b.low;
    const first = Math.min(n - 1, Math.floor((b.low - lo) / step));
    const last = Math.min(n - 1, Math.floor((b.high - lo) / step));
    for (let i = first; i <= last; i++) {
      const bl = Math.max(b.low, lo + i * step);
      const bh = Math.min(b.high, lo + (i + 1) * step);
      if (bh > bl) vols[i] += (vol * (bh - bl)) / range;
    }
  }
  const total = vols.reduce((a, v) => a + v, 0);
  let poc = 0;
  for (let i = 1; i < n; i++) if (vols[i] > vols[poc]) poc = i;
  let l = poc;
  let h = poc;
  let acc = vols[poc];
  while (acc < pct * total && (l > 0 || h < n - 1)) {
    const down = l > 0 ? vols[l - 1] : -1;
    const up = h < n - 1 ? vols[h + 1] : -1;
    if (up >= down) {
      h++;
      acc += vols[h];
    } else {
      l--;
      acc += vols[l];
    }
  }
  return {
    buckets: vols.map((v, i) => ({ low: lo + i * step, high: lo + (i + 1) * step, volume: v })),
    pocIndex: poc,
    vaLowIndex: l,
    vaHighIndex: h,
    vaLow: lo + l * step,
    vaHigh: lo + (h + 1) * step,
    poc: lo + (poc + 0.5) * step,
    totalVolume: total,
    usedBars: good.length,
    skippedBars,
  };
}
