import { FIGURES_A } from './groupA';
import { FIGURES_B } from './groupB';
import { FIGURES_C } from './groupC';
import type { FigureMap } from './kit';

export const ALL_FIGURES: FigureMap = { ...FIGURES_A, ...FIGURES_B, ...FIGURES_C };

/** Renders a lesson's extra figures in order; unknown ids are skipped (tests guard against them). */
export function LessonFigures({ ids }: { ids: string[] }) {
  return (
    <div className="grid gap-3">
      {ids.map((id) => {
        const C = ALL_FIGURES[id];
        return C ? <C key={id} /> : null;
      })}
    </div>
  );
}
