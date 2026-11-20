import { LineChart } from '../../ui/viz/LineChart';
import { useI18n } from '../../../i18n';
import type { BriefChartPoint } from '../../../shared/types/brief';

interface BriefSparklineProps {
  points: BriefChartPoint[];
  unit: string;
  decimals: number;
}

export function BriefSparkline({ points, unit, decimals }: BriefSparklineProps) {
  const { t, lang } = useI18n();
  if (!points?.length) return null;
  
  const unitKey = `brief.unit.${unit}`;
  const label = t(unitKey as any) || unit;
  
  const closeData = points.map(p => ({ t: p.t, v: p.close }));
  
  return (
    <LineChart
      points={closeData}
      ariaLabel={label}
      color="var(--accent)"
      height={80}
      formatValue={(v) => v.toLocaleString(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    />
  );
}
