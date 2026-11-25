export const CALENDAR_PAGE = 12;

/** Group consecutive events by their ICT date (input assumed sorted by time). */
export function groupByDay<T extends { dateIso: string }>(events: T[]): { dateIso: string; items: T[] }[] {
  const groups: { dateIso: string; items: T[] }[] = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last.dateIso === ev.dateIso) last.items.push(ev);
    else groups.push({ dateIso: ev.dateIso, items: [ev] });
  }
  return groups;
}

/** Filled impact dots out of 3: HIGH = 3, anything else = 2. */
export function impactDots(impactLevel: string): number {
  return impactLevel === 'HIGH' ? 3 : 2;
}

/** How many events the "Xem thêm" button reveals next (0 when everything is shown). */
export function nextPageCount(total: number, shown: number, page = CALENDAR_PAGE): number {
  return Math.max(0, Math.min(page, total - shown));
}
