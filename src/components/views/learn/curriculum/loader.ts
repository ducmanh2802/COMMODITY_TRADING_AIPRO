import type { Level } from './types';

// Full lesson bodies, quizzes and figure ids live in per-level chunks; they are fetched on demand.
const withExtrasLevel = async (level: Level): Promise<Level> => {
  const { withExtras } = await import('./extras');
  return { ...level, lessons: level.lessons.map(withExtras) };
};

const LOADERS: Record<string, () => Promise<Level>> = {
  l1: () => import('./level1').then((m) => withExtrasLevel(m.LEVEL1)),
  l2: () => import('./level2').then((m) => withExtrasLevel(m.LEVEL2)),
  l3: () => import('./level3').then((m) => withExtrasLevel(m.LEVEL3)),
  l4: () => import('./level4').then((m) => withExtrasLevel(m.LEVEL4)),
  l5: () => import('./level5').then((m) => withExtrasLevel(m.LEVEL5)),
  l6: () => import('./level6').then((m) => withExtrasLevel(m.LEVEL6)),
  l7: () => import('./level7').then((m) => withExtrasLevel(m.LEVEL7)),
  l8: () => import('./level8').then((m) => withExtrasLevel(m.LEVEL8)),
  l9: () => import('./level9').then((m) => withExtrasLevel(m.LEVEL9)),
  l10: () => import('./level10').then((m) => withExtrasLevel(m.LEVEL10)),
};

const cache = new Map<string, Promise<Level>>();

export function loadLevel(levelId: string): Promise<Level> {
  let p = cache.get(levelId);
  if (!p) {
    const load = LOADERS[levelId];
    p = load ? load() : Promise.reject(new Error(`Unknown level ${levelId}`));
    // Allow a retry after a failed chunk fetch.
    p.catch(() => cache.delete(levelId));
    cache.set(levelId, p);
  }
  return p;
}

/** Loads several levels, returned in the order requested. */
export function loadLevels(levelIds: readonly string[]): Promise<Level[]> {
  return Promise.all(levelIds.map(loadLevel));
}

export const LEVEL_IDS: readonly string[] = Object.keys(LOADERS);
