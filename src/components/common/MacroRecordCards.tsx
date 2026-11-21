import type { FundamentalMacroRecord } from '../../shared/types/analysis';
import { useT } from '../../i18n';
import {
  changeText,
  datasetName,
  fredSeriesId,
  macroGroup,
  periodLabel,
  recordChange,
  sourceLabel,
  unitWords,
  valueText,
  type MacroGroup,
} from './macroRecordFormat';

const GROUPS: MacroGroup[] = ['COMMODITY', 'US_MACRO', 'OTHER'];

/** Macro / fundamental records grouped into cards: friendly names, formatted numbers, neutral change text. */
export function MacroRecordCards({ records }: { records: FundamentalMacroRecord[] }) {
  const t = useT();
  return (
    <div className="space-y-4 p-4">
      {GROUPS.map((g) => {
        const items = records.filter((r) => macroGroup(r) === g);
        if (items.length === 0) return null;
        return (
          <section key={g} className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/40">
            <h3 className="px-4 py-2 text-xs font-semibold text-[var(--text-strong)] border-b border-[var(--border)]">
              {t(`fr.rec.group.${g}`)} ({items.length})
            </h3>
            {g === 'COMMODITY' && <p className="px-4 pt-2 text-[11px] text-[var(--text)]/55">{t('fr.rec.commodityNote')}</p>}
            <div className="divide-y divide-[var(--border)]/70">
              {items.map((r) => {
                const change = recordChange(r);
                const color =
                  change?.dir === 'UP' ? 'text-[var(--positive)]' : change?.dir === 'DOWN' ? 'text-[var(--negative)]' : 'text-[var(--text)]/60';
                const arrow = change?.dir === 'UP' ? '▲' : change?.dir === 'DOWN' ? '▼' : '';
                const id = fredSeriesId(r.source);
                const ctext = changeText(t, r);
                return (
                  <div key={r.id} className="p-4 space-y-1 text-xs">
                    <p className="font-semibold text-[var(--text-strong)]" title={r.dataset}>
                      {datasetName(t, r.dataset)}
                    </p>
                    <p className="text-sm text-[var(--text-strong)] tabular-nums">
                      {valueText(t, r.actualValue)}{' '}
                      <span className="text-xs text-[var(--text)]/65">{unitWords(t, r.unit)}</span>
                    </p>
                    {ctext && (
                      <p className={`text-[11px] ${color}`}>
                        {arrow} {ctext}
                      </p>
                    )}
                    <p className="text-[11px] text-[var(--text)]/60">
                      {periodLabel(t, r)} ·{' '}
                      {id ? (
                        <a
                          href={`https://fred.stlouisfed.org/series/${id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--accent-text)] hover:underline"
                          title={r.source}
                        >
                          {sourceLabel(r)}
                        </a>
                      ) : (
                        <span title={r.source}>{sourceLabel(r)}</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
