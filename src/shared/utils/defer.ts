/**
 * Runs `fn` after the first paint and a short idle delay, so background data loading does not compete
 * with the first render (LCP) for bandwidth/CPU. Returns a cancel function. In non-browser contexts
 * (tests/SSR) it runs on the next macrotask.
 */
export function afterFirstPaint(fn: () => void, delayMs = 1200): () => void {
  if (typeof window === 'undefined') {
    const t = setTimeout(fn, 0);
    return () => clearTimeout(t);
  }
  let timer: number | undefined;
  const raf = window.requestAnimationFrame(() => {
    timer = window.setTimeout(fn, delayMs);
  });
  return () => {
    window.cancelAnimationFrame(raf);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
