import { Suspense, lazy } from 'react';

/** Lazily-loaded "Học" (Learn) module (T31) in its own chunk. */
const LearnView = lazy(() => import('./LearnView'));

export function LazyLearnView() {
  return (
    <Suspense fallback={<p className="text-xs text-[#E5E7EB]/55 py-10 text-center">Đang tải module Học…</p>}>
      <LearnView />
    </Suspense>
  );
}
