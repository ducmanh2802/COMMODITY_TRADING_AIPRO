import type { ComponentType } from 'react';

export interface PhaseStep {
  label: string;
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

/** N-step strip with one highlighted step (e.g. 4 cycle phases). active = null -> nothing highlighted. */
export function PhaseStrip({ steps, active, ariaLabel }: { steps: PhaseStep[]; active: number | null; ariaLabel: string }) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label={ariaLabel}>
      {steps.map((s, i) => {
        const on = active === i;
        return (
          <li
            key={s.label}
            aria-current={on ? 'step' : undefined}
            className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-1 py-3 text-center ${
              on ? 'border-[#FBBF24] bg-[#FBBF24]/15 text-white' : 'border-[var(--border)] text-[var(--muted)]'
            }`}
          >
            <s.Icon className={`w-7 h-7 ${on ? 'text-[#FBBF24]' : ''}`} aria-hidden="true" />
            <span className="text-sm sm:text-base font-semibold leading-tight">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
