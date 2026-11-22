import { useEffect, useState } from 'react';

/** Read a CSS custom property (design token) from <html>, with a fallback for tests / SSR. */
export function cssVar(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Apply alpha (0..1) to a #rgb / #rrggbb / rgb()/rgba() colour. Returns an rgba() string. */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  let r = 0;
  let g = 0;
  let b = 0;
  if (c.startsWith('#')) {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const m = c.match(/[\d.]+/g);
    if (m && m.length >= 3) [r, g, b] = m.slice(0, 3).map(Number);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Palette for canvas charts, resolved from the active theme. */
export function chartPalette() {
  return {
    up: cssVar('--positive', '#38BDF8'),
    down: cssVar('--negative', '#F5A524'),
    warning: cssVar('--warning', '#FACC15'),
    accent: cssVar('--accent', '#6E7BFF'),
    accentText: cssVar('--accent-text', '#AEB6FF'),
    surface: cssVar('--surface', '#131A26'),
    text: cssVar('--text', '#E6EAF2'),
    border: cssVar('--border', '#243045'),
    series: [1, 2, 3, 4, 5, 6].map((i) => cssVar(`--series-${i}`, '#7FB2E5')),
  };
}

/** Changes whenever <html data-theme> flips; put it in a chart effect's deps to rebuild with new colours. */
export function useThemeKey(): string {
  const read = () => document.documentElement.getAttribute('data-theme') ?? 'dark';
  const [k, setK] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setK(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return k;
}
