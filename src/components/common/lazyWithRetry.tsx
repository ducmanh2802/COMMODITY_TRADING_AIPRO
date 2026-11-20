import React, { Component, Suspense, lazy, type ComponentType } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ModuleErrorBoundaryProps {
  children: React.ReactNode;
  onRetry: () => void;
}

interface ModuleErrorBoundaryState {
  error: Error | null;
}

class ModuleErrorBoundary extends Component<ModuleErrorBoundaryProps, ModuleErrorBoundaryState> {
  state: ModuleErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Module load error:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="bg-[#111622] border border-[#263244] rounded-xl p-6 max-w-lg mx-auto my-8 space-y-4">
          <div className="flex items-center gap-2.5 text-[#F59E0B]">
            <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Không thể tải mô-đun giao diện</h2>
          </div>
          <p className="text-xs text-[#E5E7EB]/70 leading-relaxed">
            Máy chủ phát triển vừa khởi động lại hoặc kết nối tạm gián đoạn khi nạp file giao diện. Bạn có thể thử nạp lại mô-đun hoặc tải lại trang.
          </p>
          <p className="text-[11px] font-mono text-[#E5E7EB]/55 bg-[#0B0E14] border border-[#263244] rounded p-2.5 break-all">
            {this.state.error.message}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onRetry();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Thử tải lại</span>
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] text-white text-xs font-medium rounded-md transition-colors"
            >
              <span>Tải lại toàn trang</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

async function importWithRetry<T>(loader: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await loader();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

/**
 * Wraps React.lazy with automatic retry on transient Vite/network dynamic-import failures
 * and a module-scoped ErrorBoundary so a failed chunk never crashes the entire sidebar shell.
 */
export function lazyWithRetry<M, P extends object = object>(
  load: () => Promise<M>,
  pick: (mod: M) => ComponentType<P>,
  fallbackText = 'Đang tải mô-đun…',
  displayName?: string
): ComponentType<P> {
  const createLazy = () =>
    lazy(async () => {
      const mod = await importWithRetry(load);
      return { default: pick(mod) };
    });

  let CurrentLazy = createLazy();

  function ResilientLazyView(props: P) {
    const [retryKey, setRetryKey] = React.useState(0);

    const handleRetry = () => {
      CurrentLazy = createLazy();
      setRetryKey((k) => k + 1);
    };

    return (
      <ModuleErrorBoundary onRetry={handleRetry}>
        <Suspense
          key={retryKey}
          fallback={<p className="text-xs text-[#E5E7EB]/55 py-10 text-center">{fallbackText}</p>}
        >
          <CurrentLazy {...props} />
        </Suspense>
      </ModuleErrorBoundary>
    );
  }

  ResilientLazyView.displayName = displayName ?? 'ResilientLazyView';
  return ResilientLazyView;
}
