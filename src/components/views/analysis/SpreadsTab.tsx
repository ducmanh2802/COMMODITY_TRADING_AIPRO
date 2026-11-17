/**
 * Spreads tab: inter-commodity spread builder. spread[t] = Σ coefficient_k · price_k[t] on the timestamp
 * intersection of all legs, followed by a rolling z-score. No exchange constants are built in: the user
 * states every coefficient, every leg's price unit and the output unit (see `src/shared/analytics/spreads.ts`).
 * Presets are labelled EXAMPLES and carry a visible verify-warning.
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { SeriesOption } from '../../../api/analysisApi';
import { type SeriesPoint, interCommoditySpread, spreadZScore } from '../../../shared/analytics';
import { CHART_COLORS, type ChartLine, TimeSeriesChart } from './TimeSeriesChart';
import {
  Notice,
  NumberField,
  Panel,
  SeriesIntegrity,
  StatusBlock,
  fmtDate,
  fmtNum,
  inputClass,
  labelClass,
  latestValue,
  useLoadedSeries,
  useOptionMap,
} from './shared';

interface LegDraft {
  uid: number;
  seriesKey: string;
  coefficient: number;
  priceUnit: string;
}

interface Preset {
  id: string;
  label: string;
  outputUnit: string;
  note: string;
  legs: { instrumentId: string; coefficient: number; priceUnit: string }[];
}

/**
 * EXAMPLE presets only. Coefficients assume the stated quote units; they are NOT verified exchange
 * constants and must be checked against the contract specifications and the units of the imported data.
 */
const PRESETS: Preset[] = [
  {
    id: 'crush',
    label: 'Soybean crush (example coefficients — verify)',
    outputUnit: 'USD/bu',
    note:
      'Assumes meal quoted in USD/short ton (×0.022 ≈ 44 lb meal per bu), oil in US cents/lb (×0.11 ≈ 11 lb oil per bu → USD), beans in US cents/bu (×−0.01 → USD). Yields vary; verify units of your imported data.',
    legs: [
      { instrumentId: 'CBOT:ZM', coefficient: 0.022, priceUnit: 'USD/short ton' },
      { instrumentId: 'CBOT:ZL', coefficient: 0.11, priceUnit: 'USc/lb' },
      { instrumentId: 'CBOT:ZS', coefficient: -0.01, priceUnit: 'USc/bu' },
    ],
  },
];

const ZERO_AND_BANDS = [0, 2, -2];
const zFmt = (v: number) => v.toFixed(2);

let uidCounter = 1;

export function SpreadsTab({ options }: { options: SeriesOption[] }) {
  const byKey = useOptionMap(options);
  const [legs, setLegs] = useState<LegDraft[]>([
    { uid: uidCounter++, seriesKey: '', coefficient: 1, priceUnit: '' },
    { uid: uidCounter++, seriesKey: '', coefficient: -1, priceUnit: '' },
  ]);
  const [outputUnit, setOutputUnit] = useState('');
  const [zWindow, setZWindow] = useState(20);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [presetMissing, setPresetMissing] = useState<string[]>([]);

  const selected = useMemo(
    () => [...new Set(legs.map((l) => l.seriesKey))].map((k) => byKey.get(k)).filter((o): o is SeriesOption => !!o),
    [legs, byKey]
  );
  const { data, loading, error } = useLoadedSeries(selected);
  const dataByKey = useMemo(() => new Map(data.map((d) => [d.option.key, d])), [data]);

  const update = (uid: number, patch: Partial<LegDraft>) => setLegs((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) {
      setActivePreset(null);
      setPresetMissing([]);
      return;
    }
    const missing: string[] = [];
    const next: LegDraft[] = p.legs.map((pl) => {
      // Prefer an unadjusted CONTINUOUS series for the instrument, else any series of it.
      const candidates = options.filter((o) => o.instrumentId === pl.instrumentId);
      const pick = candidates.find((o) => o.contractCode === 'CONTINUOUS' && o.timeframe === 'D1') ?? candidates[0];
      if (!pick) missing.push(pl.instrumentId);
      return { uid: uidCounter++, seriesKey: pick?.key ?? '', coefficient: pl.coefficient, priceUnit: pl.priceUnit };
    });
    setLegs(next);
    setOutputUnit(p.outputUnit);
    setActivePreset(p);
    setPresetMissing(missing);
  };

  const legIds = (l: LegDraft, i: number) => {
    const o = byKey.get(l.seriesKey);
    return o ? `${o.instrumentId}:${o.contractCode}:${o.timeframe}#${i + 1}` : `leg${i + 1}`;
  };

  const ready = legs.length >= 2 && legs.every((l) => dataByKey.has(l.seriesKey));
  const spread = useMemo(() => {
    if (!ready) return null;
    return interCommoditySpread(
      legs.map((l, i) => ({
        id: legIds(l, i),
        series: (dataByKey.get(l.seriesKey)?.closes ?? []) as SeriesPoint[],
        coefficient: l.coefficient,
        priceUnit: l.priceUnit,
      })),
      { outputUnit }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, legs, dataByKey, outputUnit]);

  const z = useMemo(() => {
    if (!spread || spread.status !== 'OK') return null;
    const series = spread.timestamps.map((t, i) => ({ t, v: spread.values[i] as number }));
    return spreadZScore(series, { window: zWindow });
  }, [spread, zWindow]);

  const spreadLines = useMemo<ChartLine[]>(
    () =>
      spread && spread.status === 'OK'
        ? [{ name: `Spread (${spread.outputUnit})`, color: CHART_COLORS[0], points: spread.timestamps.map((t, i) => ({ t, v: spread.values[i] })) }]
        : [],
    [spread]
  );
  const zLines = useMemo<ChartLine[]>(
    () => (z && z.status === 'OK' ? [{ name: `z-score (${zWindow})`, color: CHART_COLORS[2], points: z.timestamps.map((t, i) => ({ t, v: z.values[i] })) }] : []),
    [z, zWindow]
  );

  const unitMismatches = legs
    .map((l) => {
      const o = byKey.get(l.seriesKey);
      return o && l.priceUnit.trim() && o.priceUnit && l.priceUnit.trim() !== o.priceUnit ? `${o.label}: stated "${l.priceUnit}" but dataset unit is "${o.priceUnit}"` : null;
    })
    .filter((x): x is string => x !== null);

  return (
    <div className="space-y-4">
      <Panel
        title="Inter-commodity spread builder"
        subtitle="spread[t] = Σ coefficient × price on the common timestamps of all legs (no fill). You state every coefficient and unit; nothing is hard-coded."
      >
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="spread-preset" className={labelClass}>
              Preset (examples only)
            </label>
            <select id="spread-preset" className={inputClass} value={activePreset?.id ?? ''} onChange={(e) => applyPreset(e.target.value)}>
              <option value="">— custom —</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="spread-outunit" className={labelClass}>
              Output unit (required)
            </label>
            <input id="spread-outunit" className={`${inputClass} w-40`} value={outputUnit} placeholder="e.g. USD/bu" onChange={(e) => setOutputUnit(e.target.value)} />
          </div>
          <NumberField id="spread-zwin" label="z-score window" value={zWindow} onChange={setZWindow} min={3} />
        </div>

        {activePreset && (
          <Notice tone="warn">
            <p className="font-semibold">VERIFY: “{activePreset.label}” uses EXAMPLE coefficients, not verified exchange constants.</p>
            <p>{activePreset.note}</p>
            {presetMissing.length > 0 && <p>No imported series found for: {presetMissing.join(', ')} — pick a series manually.</p>}
          </Notice>
        )}

        <div className="space-y-2">
          {legs.map((l, i) => (
            <div key={l.uid} className="flex flex-wrap items-end gap-3 border border-[#263244] rounded-md p-2">
              <span className="text-[11px] font-mono text-[#E5E7EB]/50 pb-2">Leg {i + 1}</span>
              <div>
                <label htmlFor={`leg-series-${l.uid}`} className={labelClass}>
                  Series
                </label>
                <select
                  id={`leg-series-${l.uid}`}
                  className={`${inputClass} font-mono min-w-[220px]`}
                  value={l.seriesKey}
                  onChange={(e) => {
                    const o = byKey.get(e.target.value);
                    update(l.uid, { seriesKey: e.target.value, priceUnit: l.priceUnit || o?.priceUnit || '' });
                  }}
                >
                  <option value="">— select —</option>
                  {options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label} ({o.priceUnit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`leg-coef-${l.uid}`} className={labelClass}>
                  Coefficient
                </label>
                <input
                  id={`leg-coef-${l.uid}`}
                  type="number"
                  step="any"
                  className={`${inputClass} w-28 font-mono`}
                  value={Number.isFinite(l.coefficient) ? l.coefficient : ''}
                  onChange={(e) => update(l.uid, { coefficient: e.target.value === '' ? NaN : Number(e.target.value) })}
                />
              </div>
              <div>
                <label htmlFor={`leg-unit-${l.uid}`} className={labelClass}>
                  Leg price unit (required)
                </label>
                <input id={`leg-unit-${l.uid}`} className={`${inputClass} w-36`} value={l.priceUnit} onChange={(e) => update(l.uid, { priceUnit: e.target.value })} />
              </div>
              <button
                type="button"
                aria-label={`Remove leg ${i + 1}`}
                disabled={legs.length <= 2}
                onClick={() => setLegs((ls) => ls.filter((x) => x.uid !== l.uid))}
                className="p-2 text-[#E5E7EB]/60 hover:text-[#EF4444] disabled:opacity-30"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLegs((ls) => [...ls, { uid: uidCounter++, seriesKey: '', coefficient: 1, priceUnit: '' }])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#172033] border border-[#263244] rounded-md text-xs text-white hover:bg-[#172033]/80"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add leg
          </button>
        </div>

        {unitMismatches.length > 0 && (
          <Notice tone="warn">
            <p className="font-semibold">Stated leg unit differs from the dataset's unit:</p>
            <ul className="list-disc pl-4">
              {unitMismatches.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Notice>
        )}
        {loading && <p className="text-xs text-[#E5E7EB]/55">Loading candles…</p>}
        {error && <Notice tone="error">{error}</Notice>}
        {data.map((d) => (
          <SeriesIntegrity key={d.option.key} s={d} returnBased={false} />
        ))}
        {!ready && <Notice tone="info">Select a series for every leg (at least 2 legs).</Notice>}
      </Panel>

      {spread && (
        <Panel title="Spread" subtitle={`Output unit: ${spread.outputUnit || '—'}`}>
          <StatusBlock label="Spread" status={spread.status} reason={spread.reason} warnings={spread.warnings} />
          {spread.status !== 'INVALID_INPUT' && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-[#E5E7EB]/80">
              <span>Common points: {spread.timestamps.length}</span>
              <span>
                Dropped in alignment:{' '}
                {Object.entries(spread.dropped)
                  .map(([k, n]) => `${k}=${n}`)
                  .join(', ') || '—'}
              </span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="text-xs font-mono min-w-[420px]">
              <thead>
                <tr className="text-[#E5E7EB]/60 border-b border-[#263244]">
                  <th className="py-1.5 pr-4 text-left font-medium">Leg (stated assumptions)</th>
                  <th className="py-1.5 px-3 text-right font-medium">Coefficient</th>
                  <th className="py-1.5 px-3 text-left font-medium">Price unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]/70">
                {spread.legs.map((l) => (
                  <tr key={String(l.id)}>
                    <td className="py-1.5 pr-4">{l.id}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{String(l.coefficient)}</td>
                    <td className="py-1.5 px-3">{l.priceUnit || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {spread.status === 'OK' && (
            <>
              <LatestRow label="Latest spread" r={latestValue(spread.timestamps, spread.values)} unit={spread.outputUnit} />
              <TimeSeriesChart lines={spreadLines} ariaLabel="Spread chart" />
            </>
          )}
        </Panel>
      )}

      {z && (
        <Panel title="Spread z-score" subtitle="z = (spread − rolling mean) / rolling sample σ; window includes the current point.">
          <StatusBlock label="z-score" status={z.status} reason={z.reason} warnings={z.warnings} />
          {z.status === 'OK' && (
            <>
              <LatestRow label="Latest z" r={latestValue(z.timestamps, z.values)} />
              <TimeSeriesChart lines={zLines} valueFormatter={zFmt} referenceLines={ZERO_AND_BANDS} height={220} ariaLabel="Spread z-score chart" />
            </>
          )}
        </Panel>
      )}
    </div>
  );
}

function LatestRow({ label, r, unit }: { label: string; r: { t: string; v: number } | null; unit?: string }) {
  return (
    <p className="text-xs font-mono text-[#E5E7EB]/80">
      {label}: <span className="text-white">{fmtNum(r?.v ?? null, 4)}</span>
      {unit ? ` ${unit}` : ''} @ {fmtDate(r?.t)}
    </p>
  );
}
