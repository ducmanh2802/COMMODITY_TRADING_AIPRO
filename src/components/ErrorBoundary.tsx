import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { tr } from '../i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || tr('error.unexpected'),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Terminal ErrorBoundary caught error:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0E14] text-[#E5E7EB] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#111622] border border-[#263244] rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#EF4444]">
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <h1 className="text-base font-semibold">{tr('error.title')}</h1>
            </div>
            <p className="text-sm text-[#E5E7EB]/80 leading-relaxed">
              {tr('error.body')}
            </p>
            <pre className="text-xs font-mono bg-[#0B0E14] border border-[#263244] rounded p-3 overflow-x-auto text-[#F59E0B]">
              {this.state.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#6366F1] hover:bg-[#6366F1]/90 text-white rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              {tr('error.reload')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
