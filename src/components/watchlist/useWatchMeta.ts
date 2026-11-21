import { useCallback } from 'react';
import { useTerminal } from '../../contexts/TerminalContext';
import { useT } from '../../i18n';
import { getCommodityVisual } from '../../shared/data/commodityVisuals';
import type { WatchZone } from '../../shared/watchlist/watchlist';
import { describeZone } from '../../shared/watchlist/watchlist';

const fmtN = (n: number): string => (Math.abs(n) >= 1000 ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, ''));

/** Display helpers shared by the alert monitor, the editor and the panel. */
export function useWatchMeta() {
  const { instruments } = useTerminal();
  const t = useT();
  const nameOf = useCallback(
    (symbol: string): string => {
      const inst = instruments.find((i) => i.exchangeSymbol === symbol);
      if (!inst) return symbol;
      return getCommodityVisual(inst.id)?.nameVi ?? inst.commodityProfile?.vietnameseName ?? inst.productName ?? symbol;
    },
    [instruments],
  );
  const fmtZone = useCallback((zone: WatchZone): string => describeZone(zone, fmtN).text, []);
  const zoneLabel = useCallback(
    (zone: WatchZone): string => {
      const d = describeZone(zone, fmtN);
      return t(d.kind === 'range' ? 'wl.row.zoneRange' : d.kind === 'up' ? 'wl.row.zoneUp' : 'wl.row.zoneDown', { v: d.text });
    },
    [t],
  );
  return { nameOf, fmtZone, zoneLabel, fmtPrice: fmtN };
}
