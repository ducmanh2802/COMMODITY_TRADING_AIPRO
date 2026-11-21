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
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label htmlFor="toolbar-symbol-select" className="sr-only">
            {t('chart.toolbar.selectContract')}
          </label>
          <select
            id="toolbar-symbol-select"
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
          >
            {instruments.map((inst) => (
              <option key={inst.id} value={inst.exchangeSymbol}>
                {inst.exchangeSymbol} ({inst.exchange}) · {inst.productName}
              </option>
            ))}
          </select>
        </div>

        {showTimeframe && (
          <div className="flex flex-wrap items-center gap-1 bg-[var(--bg)] border border-[var(--border)] rounded-md p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                  timeframe === tf
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text)]/65 hover:text-[var(--text-strong)]'
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
