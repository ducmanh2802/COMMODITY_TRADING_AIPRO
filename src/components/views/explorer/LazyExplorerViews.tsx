import { Suspense, lazy } from 'react';
import { useT } from '../../../i18n';

/** Lazily-loaded Contract Explorer (T09) and Term Structure (T12) views, each in its own chunk. */
const ContractExplorerView = lazy(() => import('./ContractExplorerView'));
const TermStructureView = lazy(() => import('../termstructure/TermStructureView'));

function ViewFallback() {
  const t = useT();
  return <p className="text-xs text-[#E5E7EB]/55 py-10 text-center">{t('exp.loadingModule')}</p>;
}

export function LazyContractExplorerView() {
  return (
    <Suspense fallback={<ViewFallback />}>
      <ContractExplorerView />
    </Suspense>
  );
}

export function LazyTermStructureView() {
  return (
    <Suspense fallback={<ViewFallback />}>
      <TermStructureView />
    </Suspense>
  );
}
