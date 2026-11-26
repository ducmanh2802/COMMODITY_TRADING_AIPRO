/** Pure matcher for the command palette: diacritic-insensitive (Vietnamese) token search. */

export interface PaletteEntry {
  id: string;
  /** Main text shown and matched with the highest weight. */
  label: string;
  /** Extra text matched (not shown as the label). */
  keywords?: string;
}

/** Lowercase, NFD, strip combining marks, map đ to d. "Hợp đồng" -> "hop dong". */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensOf(q: string): string[] {
  const n = normalizeText(q);
  return n ? n.split(' ') : [];
}

/**
 * Lower is better; null = no match. Every query token must appear. Label prefix < word start < substring < keywords only.
 */
export function scoreEntry(queryTokens: readonly string[], entry: PaletteEntry): number | null {
  if (queryTokens.length === 0) return 0;
  const label = normalizeText(entry.label);
  const extra = entry.keywords ? normalizeText(entry.keywords) : '';
  let total = 0;
  for (const tok of queryTokens) {
    const idx = label.indexOf(tok);
    if (idx === 0) total += 0;
    else if (idx > 0 && label[idx - 1] === ' ') total += 1;
    else if (idx > 0) total += 3;
    else if (extra.includes(tok)) total += 6;
    else return null;
  }
  return total * 100 + label.length;
}

/** Filter and rank entries; stable for ties (input order). Empty query returns the first `limit` entries. */
export function rankEntries<T extends PaletteEntry>(entries: readonly T[], query: string, limit = 30): T[] {
  const toks = tokensOf(query);
  if (toks.length === 0) return entries.slice(0, limit);
  const scored: { e: T; s: number; i: number }[] = [];
  entries.forEach((e, i) => {
    const s = scoreEntry(toks, e);
    if (s !== null) scored.push({ e, s, i });
  });
  scored.sort((a, b) => a.s - b.s || a.i - b.i);
  return scored.slice(0, limit).map((x) => x.e);
}

/** Next active index for arrow keys, wrapping. */
export function moveIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}
