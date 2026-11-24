import type { ReactNode } from 'react';
import { BookOpenCheck, Calculator, Lightbulb, SearchCheck, ShieldAlert, type LucideIcon } from 'lucide-react';

/** Picks an icon from the key point's wording (risk, math, verification) — purely decorative. */
export function iconFor(text: string): LucideIcon {
  const s = text.toLowerCase();
  if (/(tính|công thức|\d+%|r-multiple)/.test(s)) return Calculator;
  if (/(kiểm tra|đối chiếu|xác minh|nguồn|mxv\.com\.vn)/.test(s)) return SearchCheck;
  if (/(ghi|nhật ký|kế hoạch|kịch bản)/.test(s)) return BookOpenCheck;
  if (/(lỗ|rủi ro|stop|cảnh giác|lừa|ký quỹ|đòn bẩy|dừng)/.test(s)) return ShieldAlert;
  return Lightbulb;
}

const ICONS: LucideIcon[] = [ShieldAlert, Calculator, SearchCheck, BookOpenCheck, Lightbulb];

/** One icon per card; repeats fall back to the next unused icon so cards stay distinguishable. */
export function iconsFor(items: string[]): LucideIcon[] {
  const used = new Set<LucideIcon>();
  return items.map((t) => {
    let icon = iconFor(t);
    if (used.has(icon)) icon = ICONS.find((i) => !used.has(i)) ?? icon;
    used.add(icon);
    return icon;
  });
}

/** TL;DR under "Mục tiêu": the lesson's "Ghi nhớ" items as small icon cards. */
export function KeyPoints({ items, render }: { items: string[]; render: (text: string) => ReactNode }) {
  if (!items.length) return null;
  const icons = iconsFor(items);
  const cols = items.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';
  return (
    <section aria-labelledby="lesson-keypoints-h" className="space-y-2">
      <h3 id="lesson-keypoints-h" className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
        Ghi nhớ nhanh
      </h3>
      <ul className={`grid gap-2 ${items.length === 4 ? 'sm:grid-cols-2' : cols}`}>
        {items.map((r, i) => {
          const Icon = icons[i];
          return (
            <li key={r} className="flex items-start gap-2.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-[13px] leading-snug">
              <span aria-hidden="true" className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">
                <Icon className="w-4 h-4" />
              </span>
              <span className="min-w-0">{render(r)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
