/** T95: pure helpers for the futures chain table (spread vs nearest month, liquidity share, leader). */

export interface ChainInputRow {
  contract: string;
  price: number;
  volume: number | null;
  openInterest: number | null;
}

interface ChainDerivedRow {
  /** Price minus the nearest month's price; null for the nearest month itself. */
  spreadVsNear: number | null;
  /** Share (0..1) of the summed volume across rows that report volume; null if volume missing. */
  volumeShare: number | null;
  oiShare: number | null;
}

export interface ChainDerived {
  rows: ChainDerivedRow[];
  /** Index of the row with the largest volume (null when no row reports volume). */
  volumeLeader: number | null;
  oiLeader: number | null;
}

function leaderOf(values: Array<number | null>): number | null {
  let best: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || !(v > 0)) continue;
    if (best === null || v > (values[best] as number)) best = i;
  }
  return best;
}

function shares(values: Array<number | null>): Array<number | null> {
  const total = values.reduce<number>((a, v) => a + (v !== null && v > 0 ? v : 0), 0);
  return values.map((v) => (v === null || total <= 0 ? null : v / total));
}

/** Rows must be sorted nearest month first. The nearest priced month is index 0. */
export function deriveChain(rows: ChainInputRow[]): ChainDerived {
  const vol = rows.map((r) => r.volume);
  const oi = rows.map((r) => r.openInterest);
  const vs = shares(vol);
  const os = shares(oi);
  return {
    rows: rows.map((r, i) => ({
      spreadVsNear: i === 0 ? null : r.price - rows[0].price,
      volumeShare: vs[i],
      oiShare: os[i],
    })),
    volumeLeader: leaderOf(vol),
    oiLeader: leaderOf(oi),
  };
}

/** True when liquidity has moved away from the nearest month (hint: nearest is close to expiry). */
export function liquidityMovedAway(d: ChainDerived): boolean {
  return d.volumeLeader !== null && d.volumeLeader !== 0;
}
