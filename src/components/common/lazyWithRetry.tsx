import React, { Component, Suspense, lazy, type ComponentType } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { tr } from '../../i18n';

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
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 max-w-lg mx-auto my-8 space-y-4">
          <div className="flex items-center gap-2.5 text-[var(--warning)]">
            <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">Không thể tải mô-đun giao diện</h2>
          </div>
          <p className="text-xs text-[var(--text)]/70 leading-relaxed">
            Máy chủ phát triển vừa khởi động lại hoặc kết nối tạm gián đoạn khi nạp file giao diện. Bạn có thể thử nạp lại mô-đun hoặc tải lại trang.
          </p>
          <details className="text-[11px] text-[var(--muted)]">
            <summary className="cursor-pointer select-none">{tr('err2.details')}</summary>
            <p className="mt-1 font-mono text-[var(--text)]/55 bg-[var(--bg)] border border-[var(--border)] rounded p-2.5 break-all">
              {this.state.error.message}
            </p>
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onRetry();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Thử tải lại</span>
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/80 border border-[var(--border)] text-[var(--text-strong)] text-xs font-medium rounded-md transition-colors"
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
          fallback={<p className="text-xs text-[var(--text)]/55 py-10 text-center min-h-[60vh]">{fallbackText}</p>}
        >
          <CurrentLazy {...props} />
        </Suspense>
      </ModuleErrorBoundary>
    );
  }

  ResilientLazyView.displayName = displayName ?? 'ResilientLazyView';
  return ResilientLazyView;
}
