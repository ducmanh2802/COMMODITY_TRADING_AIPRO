import { lazyWithRetry } from '../../common/lazyWithRetry';

export const LazyLearnView = lazyWithRetry(
  () => import('./LearnView'),
  (m) => m.default,
  'Đang tải module Học…',
  'LazyLearnView'
);
