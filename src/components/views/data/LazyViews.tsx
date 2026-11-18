import { Suspense, lazy } from 'react';
import { useT } from '../../../i18n';

/**
 * Lazily-loaded Data Import and Charts views. Each view (and lightweight-charts, used only by Charts)
 * lives in its own chunk so the main bundle does not grow.
 */
const DataImportView = lazy(() => import('./DataImportView'));
const ChartsView = lazy(() => import('../charts/ChartsView'));

function ViewFallback() {
  const t = useT();
  return <p className="text-xs text-[#E5E7EB]/55 py-10 text-center">{t('data.loadingModule')}</p>;
}

export function LazyDataImportView() {
  return (
    <Suspense fallback={<ViewFallback />}>
      <DataImportView />
    </Suspense>
  );
}

export function LazyChartsView() {
  return (
    <Suspense fallback={<ViewFallback />}>
      <ChartsView />
    </Suspense>
  );
}

/** Analysis (T13/T14/T16 research screens) and COT (T15/T25) views, each in its own chunk. */
const AnalysisView = lazy(() => import('../analysis/AnalysisView'));
const CotView = lazy(() => import('../cot/CotView'));

export function LazyAnalysisView() {
  return (
    <Suspense fallback={<ViewFallback />}>
      <AnalysisView />
    </Suspense>
  );
}

export function LazyCotView() {
  return (
    <Suspense fallback={<ViewFallback />}>
      <CotView />
    </Suspense>
  );
}
