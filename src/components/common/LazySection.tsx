import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Skeleton } from '../ui/Skeleton';

/** Renders children only once the placeholder is within `rootMargin` of the viewport. */
export function LazySection({ children, minHeight = 160, rootMargin = '200px' }: { children: ReactNode; minHeight?: number; rootMargin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  if (visible) return <>{children}</>;
  return (
    <div ref={ref} style={{ height: minHeight }} aria-hidden="true">
      <Skeleton className="h-full w-full" />
    </div>
  );
}
