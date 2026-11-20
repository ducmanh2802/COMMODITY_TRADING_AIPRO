import { lazyWithRetry } from '../../common/lazyWithRetry';

export const LazyContractExplorerView = lazyWithRetry(
  () => import('./ContractExplorerView'),
  (m) => m.default,
  'Đang tải mô-đun Hợp đồng…',
  'LazyContractExplorerView'
);

export const LazyTermStructureView = lazyWithRetry(
  () => import('../termstructure/TermStructureView'),
  (m) => m.default,
  'Đang tải mô-đun Cấu trúc kỳ hạn…',
  'LazyTermStructureView'
);
