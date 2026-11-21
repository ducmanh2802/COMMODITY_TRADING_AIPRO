import { ShieldAlert } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { AppModuleId } from '../../shared/types/risk';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { hasKey, useT } from '../../i18n';

interface PhaseModulePlaceholderProps {
  moduleId: AppModuleId;
}

export function PhaseModulePlaceholder({ moduleId }: PhaseModulePlaceholderProps) {
  const { modules, roadmap, setActiveModule } = useTerminal();
  const descriptor = modules.find((m) => m.id === moduleId);
  const t = useT();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">
            {descriptor ? descriptor.label : moduleId}
          </h1>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            {descriptor
              ? descriptor.summary
              : t('dash.ph.defaultSummary')}
          </p>
        </div>
        <span className="font-mono text-xs text-[var(--warning)] whitespace-nowrap">
          {t('dash.ph.scheduled', { phase: descriptor?.phase ?? '2+' })}
        </span>
      </div>

      {/* Fail-Closed Architectural Contract */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[var(--warning)]">
            <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('dash.ph.contract')}</h2>
          </div>
          <DataStatusBadge status="UNAVAILABLE" />
        </div>

        <p className="text-xs text-[var(--text)]/75 leading-relaxed">
          {descriptor?.failClosedBehavior ??
            t('dash.ph.defaultFail')}
        </p>

        {descriptor && descriptor.dependencies.length > 0 && (
          <div className="pt-2 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--text)]/55 mb-1.5">{t('dash.ph.deps')}</p>
            <p className="text-xs font-mono text-[var(--text)]/85">
              {descriptor.dependencies.join(' · ')}
            </p>
          </div>
        )}
      </section>

      {/* Active Development Roadmap Context */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('dash.ph.roadmap')}</h2>
          <button
            type="button"
            onClick={() => setActiveModule('overview')}
            className="text-xs text-[var(--accent)] hover:text-[var(--accent)]/80 whitespace-nowrap"
          >
            {t('dash.ph.back')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roadmap.map((item) => (
            <div
              key={item.phase}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text-strong)]">
                  {t('dash.ph.phase', { phase: item.phase, title: item.title })}
                </span>
                <span
                  className={`font-mono text-[11px] ${
                    item.status === 'COMPLETED'
                      ? 'text-[var(--positive)]'
                      : item.status === 'ACTIVE'
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text)]/50'
                  }`}
                >
                  {hasKey(`dash.phase.${item.status}`) ? t(`dash.phase.${item.status}` as 'dash.phase.ACTIVE') : item.status}
                </span>
              </div>
              <ul className="space-y-1 text-xs text-[var(--text)]/65">
                {item.deliverables.map((d) => (
                  <li key={d}>· {d}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
