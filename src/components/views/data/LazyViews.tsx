import { lazyWithRetry } from '../../common/lazyWithRetry';

export const LazyDataImportView = lazyWithRetry(
  () => import('./DataImportView'),
  (m) => m.default,
  'Đang tải mô-đun Nhập dữ liệu…',
  'LazyDataImportView'
);

export const LazyChartsView = lazyWithRetry(
  () => import('../charts/ChartsView'),
  (m) => m.default,
  'Đang tải mô-đun Biểu đồ…',
  'LazyChartsView'
);

export const LazyAnalysisView = lazyWithRetry(
  () => import('../analysis/AnalysisView'),
  (m) => m.default,
  'Đang tải mô-đun Phân tích…',
  'LazyAnalysisView'
);

export const LazyCotView = lazyWithRetry(
  () => import('../cot/CotView'),
  (m) => m.default,
  'Đang tải mô-đun Báo cáo COT…',
  'LazyCotView'
);
