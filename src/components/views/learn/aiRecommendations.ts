import type { InstrumentDefinition, ProductCategory } from '../../../shared/types/instrument';
import type {
  CandidateLessonSummary,
  LessonRecommendationItem,
  LessonRecommendationLanguage,
  OpenPositionSignalPayload,
  SearchedCommoditySignalPayload,
} from '../../../shared/types/lessonRecommendation';
import { normalizeActivitySymbol, type SearchedCommoditySignal } from '../../../shared/utils/commodityActivity';
import type { PaperPosition } from '../papertrade/paperModel';
import type { LevelLike } from './academyUtils';
import type { LearnProgress } from './progress';

export interface ManualOpenPositionInput {
  instrumentId: string;
  productName?: string;
  category?: ProductCategory | null;
  direction: 'LONG' | 'SHORT';
  contracts: number;
  status: 'OPEN' | 'CLOSED';
}

const LESSON_SYMBOL_AFFINITY: Record<string, readonly string[]> = {
  'l3-grains': ['ZC', 'ZW'],
  'l3-soy': ['ZS', 'ZM', 'ZL'],
  'l3-coffee': ['KC', 'RC'],
  'l3-softs': ['SB', 'CC', 'CT'],
  'l3-precious': ['GC', 'SI', 'PL'],
  'l3-industrial': ['HG', 'TIO', 'FEF'],
  'l3-oil': ['CL', 'BRN'],
  'l3-gas': ['NG'],
  'l10-corn': ['ZC'],
  'l10-robusta': ['RC'],
  'l10-contract': ['ZC', 'RC', 'KC'],
};

const LESSON_CATEGORY_AFFINITY: Record<string, readonly ProductCategory[]> = {
  'l3-grains': ['AGRICULTURE'],
  'l3-soy': ['AGRICULTURE'],
  'l3-coffee': ['SOFT_COMMODITIES'],
  'l3-softs': ['SOFT_COMMODITIES'],
  'l3-precious': ['METALS'],
  'l3-industrial': ['METALS'],
  'l3-oil': ['ENERGY'],
  'l3-gas': ['ENERGY'],
};

const OPEN_POSITION_CORE_LESSONS = new Set([
  'l1-margin',
  'l1-expiry-roll',
  'l5-sizing',
  'l9-risk',
  'l10-margin',
  'l10-costs-roll',
]);

const SEARCH_RESEARCH_CORE_LESSONS = new Set([
  'l4-fundamental',
  'l4-cot',
  'l4-curve',
  'l7-process',
]);

function buildInstrumentLookup(instruments: readonly InstrumentDefinition[]): Map<string, InstrumentDefinition> {
  const map = new Map<string, InstrumentDefinition>();
  for (const inst of instruments) {
    map.set(inst.id.toUpperCase(), inst);
    map.set(inst.exchangeSymbol.toUpperCase(), inst);
    if (inst.mxvMapping?.mxvSymbol) {
      map.set(inst.mxvMapping.mxvSymbol.toUpperCase(), inst);
    }
  }
  return map;
}

export function normalizeOpenPositions(
  paperPositions: readonly PaperPosition[],
  manualPositions: readonly ManualOpenPositionInput[],
  instruments: readonly InstrumentDefinition[]
): OpenPositionSignalPayload[] {
  const byKey = buildInstrumentLookup(instruments);
  const merged = new Map<string, OpenPositionSignalPayload>();

  const addEntry = (
    rawInstrumentId: string,
    side: 'LONG' | 'SHORT',
    contracts: number,
    fallbackName?: string,
    fallbackCategory?: ProductCategory | null
  ) => {
    if (!Number.isFinite(contracts) || contracts <= 0) return;
    const norm = normalizeActivitySymbol(rawInstrumentId);
    const inst = byKey.get(rawInstrumentId.trim().toUpperCase()) ?? byKey.get(norm);
    const symbol = inst?.exchangeSymbol ?? norm;
    if (!symbol) return;
    const name = inst?.commodityProfile?.vietnameseName ?? inst?.productName ?? fallbackName ?? symbol;
    const category = inst?.category ?? fallbackCategory ?? null;
    const dedupeKey = `${symbol}:${side}`;
    const prev = merged.get(dedupeKey);
    if (prev) {
      merged.set(dedupeKey, { ...prev, contracts: prev.contracts + contracts });
    } else {
      merged.set(dedupeKey, { symbol, name, category, side, contracts });
    }
  };

  for (const pos of paperPositions) {
    addEntry(pos.instrumentId, pos.side, pos.contracts);
  }
  for (const pos of manualPositions) {
    if (pos.status !== 'OPEN') continue;
    addEntry(pos.instrumentId, pos.direction, pos.contracts, pos.productName, pos.category);
  }

  return Array.from(merged.values());
}

export function toSearchedSignalPayloads(
  signals: readonly SearchedCommoditySignal[]
): SearchedCommoditySignalPayload[] {
  return signals.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    category: s.category,
    count: s.count,
    lastAt: s.lastAt,
  }));
}

export function rankCandidateLessons(
  curriculum: readonly LevelLike[],
  progress: LearnProgress,
  instruments: readonly InstrumentDefinition[],
  searched: readonly SearchedCommoditySignalPayload[],
  openPositions: readonly OpenPositionSignalPayload[],
  maxCandidates = 18
): CandidateLessonSummary[] {
  const byKey = buildInstrumentLookup(instruments);

  const searchMap = new Map<string, SearchedCommoditySignalPayload>();
  for (const s of searched) {
    const sym = normalizeActivitySymbol(s.symbol);
    if (sym) searchMap.set(sym, s);
  }

  const posMap = new Map<string, OpenPositionSignalPayload>();
  for (const p of openPositions) {
    const sym = normalizeActivitySymbol(p.symbol);
    if (sym && !posMap.has(sym)) posMap.set(sym, p);
  }

  const activeCategories = new Set<string>();
  for (const s of searched) {
    if (s.category) activeCategories.add(s.category);
    const inst = byKey.get(s.symbol.toUpperCase());
    if (inst?.category) activeCategories.add(inst.category);
  }
  for (const p of openPositions) {
    if (p.category) activeCategories.add(p.category);
    const inst = byKey.get(p.symbol.toUpperCase());
    if (inst?.category) activeCategories.add(inst.category);
  }

  const scored: Array<{ candidate: CandidateLessonSummary; score: number; order: number }> = [];
  let order = 0;

  for (const lvl of curriculum) {
    for (const lesson of lvl.lessons) {
      const done = !!progress.lessons[lesson.id]?.done;
      const directSymbols = new Set<string>();
      for (const id of lesson.instrumentIds ?? []) {
        const inst = byKey.get(id.toUpperCase());
        const sym = normalizeActivitySymbol(inst?.exchangeSymbol ?? id);
        if (sym) directSymbols.add(sym);
      }
      for (const sym of LESSON_SYMBOL_AFFINITY[lesson.id] ?? []) {
        directSymbols.add(normalizeActivitySymbol(sym));
      }

      let score = 0;
      const matched = new Set<string>();

      for (const sym of directSymbols) {
        const pos = posMap.get(sym);
        if (pos) {
          score += 90;
          matched.add(pos.symbol);
        }
        const srch = searchMap.get(sym);
        if (srch) {
          score += 45 + Math.min(srch.count, 8) * 6;
          matched.add(srch.symbol);
        }
      }

      // Category affinity (smaller boost when exact symbol didn't match, still useful for same group)
      for (const cat of LESSON_CATEGORY_AFFINITY[lesson.id] ?? []) {
        if (activeCategories.has(cat)) {
          score += 20;
        }
      }

      // Open-position risk, margin, sizing, roll-cost relevance
      if (openPositions.length > 0 && OPEN_POSITION_CORE_LESSONS.has(lesson.id)) {
        score += 38;
        if (matched.size === 0) {
          for (const p of openPositions.slice(0, 2)) matched.add(p.symbol);
        }
      }

      // Frequently-searched fundamental/COT/curve research lessons
      if (searched.length > 0 && SEARCH_RESEARCH_CORE_LESSONS.has(lesson.id)) {
        score += 26;
      }

      if (!done && score > 0) {
        score += 25;
      }

      scored.push({
        candidate: {
          id: lesson.id,
          title: lesson.title,
          objective: lesson.objective,
          levelNumber: lvl.number,
          levelTitle: lvl.title,
          instrumentIds: lesson.instrumentIds ?? [],
          done,
          matchedSymbols: Array.from(matched),
        },
        score,
        order: order++,
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.order - b.order;
  });

  return scored.slice(0, maxCandidates).map((entry) => entry.candidate);
}

export function buildDirectFallbackRecommendations(
  candidates: readonly CandidateLessonSummary[],
  searched: readonly SearchedCommoditySignalPayload[],
  openPositions: readonly OpenPositionSignalPayload[],
  language: LessonRecommendationLanguage,
  limit = 4
): LessonRecommendationItem[] {
  const posBySym = new Map<string, OpenPositionSignalPayload>();
  for (const p of openPositions) {
    posBySym.set(normalizeActivitySymbol(p.symbol), p);
  }
  const searchBySym = new Map<string, SearchedCommoditySignalPayload>();
  for (const s of searched) {
    searchBySym.set(normalizeActivitySymbol(s.symbol), s);
  }

  const relevant = candidates.filter((c) => c.matchedSymbols.length > 0);
  const picked = (relevant.length > 0 ? relevant : candidates).slice(0, limit);

  return picked.map((c) => {
    const syms = c.matchedSymbols.slice(0, 3);
    const matchedPos = syms.map((s) => posBySym.get(normalizeActivitySymbol(s))).find(Boolean);
    const matchedSearch = syms.map((s) => searchBySym.get(normalizeActivitySymbol(s))).find(Boolean);

    let reason: string;
    if (language === 'vi') {
      if (matchedPos && matchedSearch) {
        reason = `Liên quan trực tiếp đến vị thế ${matchedPos.side} ${matchedPos.symbol} (${matchedPos.contracts} HĐ) và mã bạn vừa tìm kiếm (${matchedSearch.count} lần).`;
      } else if (matchedPos) {
        reason = `Hỗ trợ quản trị rủi ro và thông số cho vị thế ${matchedPos.side} ${matchedPos.symbol} (${matchedPos.contracts} HĐ) đang mở.`;
      } else if (matchedSearch) {
        reason = `Khớp với mã hàng hoá ${matchedSearch.symbol} (${matchedSearch.name}) bạn thường xuyên tìm kiếm.`;
      } else {
        reason = c.objective;
      }
    } else {
      if (matchedPos && matchedSearch) {
        reason = `Directly tied to your open ${matchedPos.side} ${matchedPos.symbol} (${matchedPos.contracts}) position and recent searches (${matchedSearch.count}x).`;
      } else if (matchedPos) {
        reason = `Covers contract mechanics and risk rules for your open ${matchedPos.side} ${matchedPos.symbol} (${matchedPos.contracts}) position.`;
      } else if (matchedSearch) {
        reason = `Matches ${matchedSearch.symbol} (${matchedSearch.name}), which you frequently search.`;
      } else {
        reason = c.objective;
      }
    }

    return {
      lessonId: c.id,
      reason,
      matchedSymbols: syms,
      priority: matchedPos ? 'HIGH' : 'MEDIUM',
    };
  });
}

export function buildSignalsSignature(
  searched: readonly SearchedCommoditySignalPayload[],
  openPositions: readonly OpenPositionSignalPayload[],
  language: LessonRecommendationLanguage
): string {
  const sPart = searched
    .map((s) => `${s.symbol}:${s.count}`)
    .sort()
    .join(',');
  const pPart = openPositions
    .map((p) => `${p.symbol}:${p.side}:${p.contracts}`)
    .sort()
    .join(',');
  return `${language}|S[${sPart}]|P[${pPart}]`;
}
