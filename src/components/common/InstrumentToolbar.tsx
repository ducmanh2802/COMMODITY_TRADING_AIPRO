import { useTerminal } from '../../contexts/TerminalContext';
import type { Timeframe } from '../../shared/types/instrument';
import { useT } from '../../i18n';

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

interface InstrumentToolbarProps {
  showTimeframe?: boolean;
  rightSlot?: React.ReactNode;
}

export function InstrumentToolbar({ showTimeframe = true, rightSlot }: InstrumentToolbarProps) {
  const { instruments, selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useTerminal();
  const t = useT();

  return (
    <div className="bg-[#111622] border border-[#263244] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label htmlFor="toolbar-symbol-select" className="sr-only">
            {t('chart.toolbar.selectContract')}
          </label>
          <select
            id="toolbar-symbol-select"
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#6366F1]"
          >
            {instruments.map((inst) => (
              <option key={inst.id} value={inst.exchangeSymbol}>
                {inst.exchangeSymbol} ({inst.exchange}) · {inst.productName}
              </option>
            ))}
          </select>
        </div>

        {showTimeframe && (
          <div className="flex flex-wrap items-center gap-1 bg-[#0B0E14] border border-[#263244] rounded-md p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                  timeframe === tf
                    ? 'bg-[#6366F1] text-white'
                    : 'text-[#E5E7EB]/65 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        )}
      </div>

      {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
