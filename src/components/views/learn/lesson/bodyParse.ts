/*
 * Pure helpers that turn plain lesson paragraphs into visual blocks (no content changes).
 * Rendering lives in LessonBody.tsx; everything here is unit-tested in bodyParse.test.ts.
 */

export interface Step {
  /** Short bold label (text before the first ":" when it is short), may be empty. */
  title: string;
  text: string;
}

export interface Field {
  label: string;
  text: string;
}

export type Block =
  | { kind: 'text'; text: string; from: number; to: number }
  | { kind: 'steps'; intro: string; steps: Step[]; from: number; to: number }
  | { kind: 'formula'; label: string; formula: string; note: string; from: number; to: number }
  | { kind: 'fields'; title: string; fields: Field[]; from: number; to: number }
  | { kind: 'example'; text: string; from: number; to: number }
  | { kind: 'warning'; title: string; text: string; from: number; to: number };

export const LONG_PARAGRAPH_WORDS = 45;

export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/** Splits "Title: rest" when the title is short (≤ 6 words, no sentence end inside). */
export function splitTitle(s: string): Step {
  const t = s.trim();
  const i = t.indexOf(':');
  if (i > 0 && i <= 48) {
    const head = t.slice(0, i).trim();
    if (wordCount(head) <= 6 && !/[.!?](\s|$)/.test(head)) return { title: head, text: t.slice(i + 1).trim() };
  }
  return { title: '', text: t };
}

const STEP_RE = /\((\d{1,2}|[a-h])\)\s*/g;

/**
 * Detects an inline enumerated list "(1) … (2) …" (or "(a) … (b) …") numbered 1..n / a..n in order.
 * Returns the intro text and the steps, or null when the paragraph is not a clean list.
 */
export function parseInlineSteps(p: string): { intro: string; steps: Step[] } | null {
  const marks = [...p.matchAll(STEP_RE)];
  if (marks.length < 2) return null;
  const first = marks[0][1];
  const alpha = /[a-h]/.test(first);
  const expected = (i: number) => (alpha ? String.fromCharCode(97 + i) : String(i + 1));
  if (marks.some((m, i) => m[1] !== expected(i))) return null;
  const intro = p.slice(0, marks[0].index).trim();
  // A real list is introduced by a colon (or starts the paragraph); "(1) kết hợp (2)" in prose is not.
  if (intro && !/:$/.test(intro)) return null;
  const steps: Step[] = marks.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : p.length;
    const raw = p
      .slice(start, end)
      .trim()
      .replace(/[,;]\s*$/, '')
      .replace(/^[a-zà-ỹđ]/u, (c) => c.toUpperCase());
    return splitTitle(raw);
  });
  if (steps.some((s) => !s.text && !s.title)) return null;
  return { intro, steps };
}

const BUOC_RE = /^Bước\s+(\d{1,2})\s*[–-]\s*/;

/** "Bước 2 – Điểm vào: …" → { n: 2, step }. */
export function parseBuoc(p: string): { n: number; step: Step } | null {
  const m = BUOC_RE.exec(p);
  if (!m) return null;
  return { n: Number(m[1]), step: splitTitle(p.slice(m[0].length)) };
}

const FORMULA_START = /^(Công thức[^:]{0,40}):\s*(.+)$/;
const NAMED_EQ = /^([A-ZÀ-ỸĐ][\p{L} %/()]{1,30})\s=\s/u;

/** "Công thức khối lượng: Số hợp đồng = (…) ÷ (…). Luôn làm tròn XUỐNG." → formula card. */
export function parseFormula(p: string): { label: string; formula: string; note: string } | null {
  let label = '';
  let rest = p.trim();
  const m = FORMULA_START.exec(rest);
  if (m) {
    label = m[1].trim();
    rest = m[2].trim();
  } else if (!NAMED_EQ.test(rest)) return null;
  if (!rest.includes('=')) return null;
  // The formula ends at the first sentence end that is followed by a capital letter.
  const end = /\.\s+(?=\p{Lu})/u.exec(rest);
  const formula = (end ? rest.slice(0, end.index) : rest.replace(/\.$/, '')).trim();
  const note = end ? rest.slice(end.index + 1).trim() : '';
  if (wordCount(formula) > 30) return null;
  // Without a "Công thức" label, only real arithmetic counts ("Setup = một tình huống…" is prose).
  if (!label && !/[×÷]/.test(formula)) return null;
  return { label, formula, note };
}

const FIELD_LABELS = ['Điều kiện', 'Vào', 'Stop', 'Mục tiêu', 'Huỷ'];

/** Setup paragraphs with ≥ 3 "Điều kiện: / Vào: / Stop: / Mục tiêu: / Huỷ:" labels → field card. */
export function parseFields(p: string): { title: string; fields: Field[] } | null {
  const re = new RegExp(`(?:^|(?<=[.!?]\\s))(${FIELD_LABELS.join('|')}):\\s*`, 'gu');
  const marks = [...p.matchAll(re)];
  if (marks.length < 3) return null;
  const title = p.slice(0, marks[0].index).trim().replace(/\.$/, '');
  const fields = marks.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : p.length;
    return { label: m[1], text: p.slice(start, end).trim() };
  });
  return { title, fields };
}

const WARNING_RE = /^(Lưu ý dữ liệu|Dấu hiệu đáng ngờ)\s*:\s*/;

/** Groups paragraphs into visual blocks; `from`/`to` keep the original paragraph indexes. */
export function parseBody(body: string[]): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < body.length; i++) {
    const p = body[i];
    const buoc = parseBuoc(p);
    if (buoc) {
      const steps = [buoc.step];
      let j = i;
      let n = buoc.n;
      while (j + 1 < body.length) {
        const next = parseBuoc(body[j + 1]);
        if (!next || next.n !== n + 1) break;
        steps.push(next.step);
        n = next.n;
        j++;
      }
      if (steps.length >= 2) {
        out.push({ kind: 'steps', intro: '', steps, from: i, to: j });
        i = j;
        continue;
      }
    }
    if (/^Ví dụ/.test(p)) {
      out.push({ kind: 'example', text: p, from: i, to: i });
      continue;
    }
    const w = WARNING_RE.exec(p);
    if (w) {
      out.push({ kind: 'warning', title: w[1], text: p.slice(w[0].length), from: i, to: i });
      continue;
    }
    const f = parseFormula(p);
    if (f) {
      out.push({ kind: 'formula', ...f, from: i, to: i });
      continue;
    }
    const fields = parseFields(p);
    if (fields) {
      out.push({ kind: 'fields', ...fields, from: i, to: i });
      continue;
    }
    const s = parseInlineSteps(p);
    if (s) {
      out.push({ kind: 'steps', ...s, from: i, to: i });
      continue;
    }
    out.push({ kind: 'text', text: p, from: i, to: i });
  }
  return out;
}

/** First sentence + the rest, for "Đọc thêm" on long paragraphs. Returns null when no split applies. */
export function splitLong(p: string, limit = LONG_PARAGRAPH_WORDS): { lead: string; rest: string } | null {
  if (wordCount(p) <= limit) return null;
  const m = /[.!?](?=\s+["“(]?\p{Lu})/u.exec(p);
  if (!m) return null;
  const lead = p.slice(0, m.index + 1).trim();
  const rest = p.slice(m.index + 1).trim();
  if (!rest || wordCount(lead) < 4) return null;
  return { lead, rest };
}

/* ---------- inline segments: arithmetic chips + glossary terms ---------- */

export type Seg = { t: 'text'; s: string } | { t: 'math'; s: string } | { t: 'term'; s: string; term: number };

const NUM = String.raw`\d+(?:[.,]\d+)*`;
const OPERAND = String.raw`(?:\(?${NUM}(?:\s*[−-]\s*${NUM})?\)?(?:\s(?:cent|USD|tick)(?![\p{L}]))?)`;
/** "12 × 50 = 600", "300 ÷ 600 = 0,5", "7,25 × 50 + 10 = 372,5". */
export const MATH_RE = new RegExp(String.raw`${OPERAND}(?:\s*[×÷+−]\s*${OPERAND})+\s*=\s*${NUM}`, 'gu');

export interface GlossaryEntry {
  term: string;
  def: string;
}

/** Everyday words that are also glossary entries; marking them would add noise ("khối lượng" = amount). */
const GENERIC_KEYS = new Set(['khối lượng', 'hàng hoá']);

/** Match keys for a glossary term: "Ký quỹ ban đầu (Initial margin)" → ["Ký quỹ ban đầu", "Initial margin"]. */
export function termKeys(term: string): string[] {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(term);
  const keys = m ? [m[1], m[2]] : [term];
  return keys.map((k) => k.trim()).filter((k) => k.length >= 4 && !/[=,]/.test(k) && !GENERIC_KEYS.has(k.toLowerCase()));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface TermMatcher {
  re: RegExp;
  /** lower-cased key → glossary index */
  byKey: Map<string, number>;
}

export function buildTermMatcher(glossary: GlossaryEntry[]): TermMatcher {
  const byKey = new Map<string, number>();
  glossary.forEach((g, i) => termKeys(g.term).forEach((k) => byKey.has(k.toLowerCase()) || byKey.set(k.toLowerCase(), i)));
  const keys = [...byKey.keys()].sort((a, b) => b.length - a.length).map(esc);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${keys.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  return { re, byKey };
}

/**
 * Chooses which glossary terms get a chip: first occurrence per lesson, at most `max`, in reading order.
 * Returns a map paragraph index → glossary indexes to mark (first occurrence inside that paragraph).
 */
export function pickTerms(paragraphs: string[], m: TermMatcher, max = 6): Map<number, Set<number>> {
  const used = new Set<number>();
  const out = new Map<number, Set<number>>();
  paragraphs.forEach((p, pi) => {
    if (used.size >= max) return;
    for (const hit of p.matchAll(m.re)) {
      const gi = m.byKey.get(hit[1].toLowerCase());
      if (gi === undefined || used.has(gi)) continue;
      used.add(gi);
      if (!out.has(pi)) out.set(pi, new Set());
      out.get(pi)!.add(gi);
      if (used.size >= max) break;
    }
  });
  return out;
}

/**
 * Splits text into plain / arithmetic / glossary segments. `allowed` is consumed: a term is marked once,
 * then removed so later pieces of the same paragraph do not repeat it.
 */
export function inlineSegments(text: string, m: TermMatcher | null, allowed: Set<number> | undefined): Seg[] {
  const out: Seg[] = [];
  const pushText = (s: string) => {
    if (!s) return;
    if (!m || !allowed || allowed.size === 0) {
      out.push({ t: 'text', s });
      return;
    }
    let last = 0;
    for (const hit of s.matchAll(m.re)) {
      const gi = m.byKey.get(hit[1].toLowerCase());
      if (gi === undefined || !allowed.has(gi)) continue;
      allowed.delete(gi);
      const at = hit.index ?? 0;
      if (at > last) out.push({ t: 'text', s: s.slice(last, at) });
      out.push({ t: 'term', s: hit[0], term: gi });
      last = at + hit[0].length;
    }
    if (last < s.length) out.push({ t: 'text', s: s.slice(last) });
  };
  let last = 0;
  for (const hit of text.matchAll(MATH_RE)) {
    const at = hit.index ?? 0;
    pushText(text.slice(last, at));
    out.push({ t: 'math', s: hit[0] });
    last = at + hit[0].length;
  }
  pushText(text.slice(last));
  return out;
}

/** Paragraph index → figure ids to render after it (only valid indexes). */
export function figuresByParagraph(figureAt: Record<string, number> | undefined, figures: string[] | undefined, bodyLength: number): { at: Map<number, string[]>; rest: string[] } {
  const at = new Map<number, string[]>();
  const placed = new Set<string>();
  for (const id of figures ?? []) {
    const i = figureAt?.[id];
    if (i === undefined || !Number.isInteger(i) || i < 0 || i >= bodyLength) continue;
    if (!at.has(i)) at.set(i, []);
    at.get(i)!.push(id);
    placed.add(id);
  }
  return { at, rest: (figures ?? []).filter((id) => !placed.has(id)) };
}
