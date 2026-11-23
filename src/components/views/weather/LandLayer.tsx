import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import land from 'world-atlas/land-110m.json';
import { ringsToPath } from './mapProjection';

// Natural Earth 110m land (public domain) via world-atlas; computed once at module load.
const topo = land as unknown as Topology<{ land: GeometryCollection }>;
const LAND_PATH = (() => {
  const rings: number[][][] = [];
  for (const f of feature(topo, topo.objects.land).features) {
    const g = f.geometry;
    if (g.type === 'Polygon') rings.push(...g.coordinates);
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) rings.push(...poly);
  }
  return ringsToPath(rings);
})();

export default function LandLayer() {
  return <path d={LAND_PATH} fill="var(--surface-2)" stroke="var(--border)" strokeWidth={1} strokeLinejoin="round" />;
}
