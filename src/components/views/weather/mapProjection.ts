/** Equirectangular projection cropped to the band that holds the growing regions. */
export const MAP_BOUNDS = { lonMin: -125, lonMax: 145, latMin: -40, latMax: 55 } as const;
export const MAP_SCALE = 4; // viewBox units per degree
export const MAP_W = (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin) * MAP_SCALE;
export const MAP_H = (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin) * MAP_SCALE;

export function projectX(lon: number): number {
  return (lon - MAP_BOUNDS.lonMin) * MAP_SCALE;
}
export function projectY(lat: number): number {
  return (MAP_BOUNDS.latMax - lat) * MAP_SCALE;
}

type Ring = ReadonlyArray<ReadonlyArray<number>>;

/** SVG path for polygon rings; rings entirely outside the crop are dropped. */
export function ringsToPath(rings: ReadonlyArray<Ring>): string {
  const { lonMin, lonMax, latMin, latMax } = MAP_BOUNDS;
  let d = '';
  for (const ring of rings) {
    if (ring.length < 3) continue;
    let inside = false;
    for (const p of ring) {
      if (p[0] >= lonMin && p[0] <= lonMax && p[1] >= latMin && p[1] <= latMax) {
        inside = true;
        break;
      }
    }
    if (!inside) continue;
    d += ring.map((p, i) => `${i ? 'L' : 'M'}${projectX(p[0]).toFixed(1)} ${projectY(p[1]).toFixed(1)}`).join('') + 'Z';
  }
  return d;
}
