/** Pure notification diffing for the radar (T64): what is NEW since the previous poll. */
import type { RadarBreakoutKind, RadarItem, RadarResponse } from '../types/radar';

const RADAR_TOP_N = 5;
/** An instrument must reach this score to count as "in the top list". */
const RADAR_MIN_TOP_SCORE = 30;

export interface RadarSnapshot {
  top: string[];
  breakouts: Record<string, RadarBreakoutKind[]>;
}
export interface RadarNote {
  id: string;
  instrumentId: string;
  symbol: string;
  name: string;
  kind: 'top' | 'breakout';
  text: string;
  at: string;
}

const BREAKOUT_TEXT: Record<RadarBreakoutKind, string> = {
  high55: 'Giá vượt đỉnh 55 phiên',
  low55: 'Giá thủng đáy 55 phiên',
  high20: 'Giá vượt đỉnh 20 phiên',
  low20: 'Giá thủng đáy 20 phiên',
};

function topIds(items: RadarItem[]): string[] {
  return [...items]
    .sort((a, b) => b.score - a.score)
    .filter((i) => i.score >= RADAR_MIN_TOP_SCORE)
    .slice(0, RADAR_TOP_N)
    .map((i) => i.id);
}

export function snapshotOf(items: RadarItem[]): RadarSnapshot {
  const breakouts: Record<string, RadarBreakoutKind[]> = {};
  for (const i of items) if (i.breakouts.length > 0) breakouts[i.id] = [...i.breakouts];
  return { top: topIds(items), breakouts };
}

/**
 * Compares the new items with the previous snapshot. First poll (prev === null) only sets the baseline, so opening the
 * app never floods the user. Muted instruments produce no notes but are still tracked in the snapshot.
 */
export function diffRadar(
  prev: RadarSnapshot | null,
  items: RadarItem[],
  muted: readonly string[] = [],
  now: () => string = () => new Date().toISOString(),
): { notes: RadarNote[]; next: RadarSnapshot } {
  const next = snapshotOf(items);
  if (!prev) return { notes: [], next };
  const mutedSet = new Set(muted);
  const byId = new Map(items.map((i) => [i.id, i]));
  const at = now();
  const notes: RadarNote[] = [];
  for (const id of next.top) {
    const it = byId.get(id);
    if (!it || mutedSet.has(id) || prev.top.includes(id)) continue;
    notes.push({
      id: `top:${id}:${it.asOf}:${it.score}`,
      instrumentId: id,
      symbol: it.symbol,
      name: it.name,
      kind: 'top',
      text: `${it.name} vừa vào nhóm sôi động nhất (độ sôi động ${it.score}/100)${it.reasons[0] ? `: ${it.reasons[0]}` : ''}`,
      at,
    });
  }
  for (const [id, kinds] of Object.entries(next.breakouts)) {
    const it = byId.get(id);
    if (!it || mutedSet.has(id)) continue;
    const before = prev.breakouts[id] ?? [];
    for (const k of kinds) {
      if (before.includes(k)) continue;
      notes.push({ id: `br:${id}:${k}:${it.asOf}`, instrumentId: id, symbol: it.symbol, name: it.name, kind: 'breakout', text: `${it.name}: ${BREAKOUT_TEXT[k]}`, at });
    }
  }
  return { notes, next };
}

const DAY_LABEL = (d: string): string => d.split('-').reverse().slice(0, 2).join('/');

/** Plain-text daily report for the clipboard. */
export function reportText(r: RadarResponse, top = RADAR_TOP_N): string {
  const L: string[] = [];
  L.push('BÁO CÁO THỊ TRƯỜNG HÔM NAY (radar độ sôi động)');
  L.push(`Cập nhật: ${r.asOf ?? 'không rõ'}${r.stale ? ' (đang làm mới)' : ''}`);
  L.push('');
  L.push(`Top ${top} mã sôi động:`);
  const items = r.items.slice(0, top);
  if (items.length === 0) L.push('- Chưa có mã nào đủ dữ liệu để chấm điểm.');
  items.forEach((i, idx) => {
    L.push(`${idx + 1}. ${i.name} (${i.symbol}) - độ sôi động ${i.score}/100, phiên ${i.asOf}, nguồn ${i.source ?? 'không rõ'}`);
    for (const reason of i.reasons) L.push(`   - ${reason}`);
    if (i.reasons.length === 0) L.push('   - Chưa có tín hiệu nổi bật.');
  });
  L.push('');
  L.push('Thiết lập đáng nghiên cứu:');
  if (r.setups.length === 0) L.push('- Hiện không có mã nào thỏa đồng thời điều kiện xu hướng, động lượng và biến động.');
  for (const s of r.setups) {
    L.push(`- ${s.name} (${s.symbol}): ${s.description}`);
    for (const c of s.conditions) L.push(`   + ${c}`);
    for (const k of s.risks) L.push(`   ! ${k}`);
  }
  L.push('');
  L.push('Sự kiện 7 ngày tới:');
  if (r.events.length === 0) L.push('- Không có sự kiện trong lịch đã biết.');
  for (const e of r.events) L.push(`- ${DAY_LABEL(e.date)}: ${e.label} (${e.source})`);
  L.push('');
  L.push('Lưu ý dữ liệu:');
  for (const c of r.caveats) L.push(`- ${c}`);
  L.push('');
  L.push(r.disclaimer);
  return L.join('\n');
}
