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
          <h1 className="text-xl font-semibold text-white tracking-tight">
            {descriptor ? descriptor.label : moduleId}
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            {descriptor
              ? descriptor.summary
              : t('dash.ph.defaultSummary')}
          </p>
        </div>
        <span className="font-mono text-xs text-[#F59E0B] whitespace-nowrap">
          {t('dash.ph.scheduled', { phase: descriptor?.phase ?? '2+' })}
        </span>
      </div>

      {/* Fail-Closed Architectural Contract */}
      <section className="bg-[#111622] border border-[#263244] rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#F59E0B]">
            <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">{t('dash.ph.contract')}</h2>
          </div>
          <DataStatusBadge status="UNAVAILABLE" />
        </div>

        <p className="text-xs text-[#E5E7EB]/75 leading-relaxed">
          {descriptor?.failClosedBehavior ??
            t('dash.ph.defaultFail')}
        </p>

        {descriptor && descriptor.dependencies.length > 0 && (
          <div className="pt-2 border-t border-[#263244]">
            <p className="text-xs text-[#E5E7EB]/55 mb-1.5">{t('dash.ph.deps')}</p>
            <p className="text-xs font-mono text-[#E5E7EB]/85">
              {descriptor.dependencies.join(' · ')}
            </p>
          </div>
        )}
      </section>

      {/* Active Development Roadmap Context */}
      <section className="bg-[#111622] border border-[#263244] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">{t('dash.ph.roadmap')}</h2>
          <button
            type="button"
            onClick={() => setActiveModule('overview')}
            className="text-xs text-[#6366F1] hover:text-[#6366F1]/80 whitespace-nowrap"
          >
            {t('dash.ph.back')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roadmap.map((item) => (
            <div
              key={item.phase}
              className="bg-[#0B0E14] border border-[#263244] rounded-md p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">
                  {t('dash.ph.phase', { phase: item.phase, title: item.title })}
                </span>
                <span
                  className={`font-mono text-[11px] ${
                    item.status === 'COMPLETED'
                      ? 'text-[#22C55E]'
                      : item.status === 'ACTIVE'
                        ? 'text-[#6366F1]'
                        : 'text-[#E5E7EB]/50'
                  }`}
                >
                  {hasKey(`dash.phase.${item.status}`) ? t(`dash.phase.${item.status}` as 'dash.phase.ACTIVE') : item.status}
                </span>
              </div>
              <ul className="space-y-1 text-xs text-[#E5E7EB]/65">
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
