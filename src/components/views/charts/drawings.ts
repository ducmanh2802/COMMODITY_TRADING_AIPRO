// Pure model + persistence for chart drawing tools (T86).
export type DrawingTool = 'hline' | 'trend' | 'zone' | 'fib' | 'text';

export interface DrawingPoint {
  /** Candle timestamp (ISO string as stored); mapped to a chart time at render. */
  ts: string;
  price: number;
}

export interface Drawing {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  text?: string;
}

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export const TOOL_POINT_COUNT: Record<DrawingTool, number> = { hline: 1, trend: 2, zone: 2, fib: 2, text: 1 };

export interface FibLevel {
  ratio: number;
  price: number;
}

/** Retracement levels between a swing start p1 and swing end p2: 0% sits at p2, 100% at p1. */
export function fibLevels(p1: number, p2: number): FibLevel[] {
  return FIB_RATIOS.map((ratio) => ({ ratio, price: p2 + (p1 - p2) * ratio }));
}

export const DRAWINGS_STORAGE_KEY = 'ctap.drawings.v1';

export function drawingsBucketKey(symbol: string, timeframe: string): string {
  return `${symbol}|${timeframe}`;
}

type Store = Record<string, unknown>;

const TOOLS: DrawingTool[] = ['hline', 'trend', 'zone', 'fib', 'text'];

export function sanitizeDrawings(input: unknown): Drawing[] {
  if (!Array.isArray(input)) return [];
  const out: Drawing[] = [];
  for (const d of input) {
    if (!d || typeof d !== 'object') continue;
    const r = d as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.tool !== 'string' || !TOOLS.includes(r.tool as DrawingTool)) continue;
    if (!Array.isArray(r.points)) continue;
    const need = TOOL_POINT_COUNT[r.tool as DrawingTool];
    const pts: DrawingPoint[] = [];
    for (const p of r.points) {
      const q = p as Record<string, unknown> | null;
      if (q && typeof q.ts === 'string' && typeof q.price === 'number' && Number.isFinite(q.price)) {
        pts.push({ ts: q.ts, price: q.price });
      }
    }
    if (pts.length !== need) continue;
    out.push({
      id: r.id,
      tool: r.tool as DrawingTool,
      points: pts,
      text: typeof r.text === 'string' ? r.text.slice(0, 120) : undefined,
    });
  }
  return out;
}

function readStore(storage: Pick<Storage, 'getItem'> | null): Store {
  try {
    const raw = storage?.getItem(DRAWINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadDrawings(
  symbol: string,
  timeframe: string,
  storage: Pick<Storage, 'getItem'> | null = defaultStorage()
): Drawing[] {
  return sanitizeDrawings(readStore(storage)[drawingsBucketKey(symbol, timeframe)]);
}

export function saveDrawings(
  symbol: string,
  timeframe: string,
  drawings: Drawing[],
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultStorage()
): void {
  try {
    if (!storage) return;
    const store = readStore(storage);
    const key = drawingsBucketKey(symbol, timeframe);
    if (drawings.length === 0) delete store[key];
    else store[key] = drawings;
    storage.setItem(DRAWINGS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable: drawings stay in memory only */
  }
}

export function newDrawingId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
