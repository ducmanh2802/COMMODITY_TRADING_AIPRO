import { useState } from 'react';
import { fmtFixed, useT } from '../../../i18n';
import { annualizedRollYield, classifySlope, rollYieldPerRoll, simulateLongRolls, SIMPLE_ROLL_YIELD_FORMULA } from '../../../shared/utils/rollYield';

export interface CarryPoint {
  contract: string;
  price: number;
  daysToExpiry: number;
}

const CHIP = {
  CONTANGO: 'text-[var(--negative)] border-[var(--negative)]/40 bg-[var(--negative)]/10',
  BACKWARDATION: 'text-[var(--positive)] border-[var(--positive)]/40 bg-[var(--positive)]/10',
  FLAT: 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10',
} as const;

const signedPct = (x: number) => `${x > 0 ? '+' : ''}${fmtFixed(x * 100, 2)}%`;

/** Carry / roll-yield card for the two nearest contracts of the curve. Education only. */
export function CarryCard({ points }: { points: CarryPoint[] }) {
  const t = useT();
  const [rollsText, setRollsText] = useState('3');
  const near = points[0];
  const far = points[1];
  const slope = near && far ? classifySlope(near.price, far.price) : null;
  const ann = near && far ? annualizedRollYield(near.price, far.price, near.daysToExpiry, far.daysToExpiry) : null;
  const per = near && far ? rollYieldPerRoll(near.price, far.price) : null;
  const sim = near && far ? simulateLongRolls(near.price, far.price, near.daysToExpiry, far.daysToExpiry, Number(rollsText)) : null;
  const ok = slope !== null && ann !== null && per !== null;
  const slopeLabel = slope === 'CONTANGO' ? t('carry.contango') : slope === 'BACKWARDATION' ? t('carry.backwardation') : t('carry.flat');

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3" aria-label={t('carry.title')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('carry.title')}</h2>
        {ok && slope && (
          <span className={`inline-flex items-center min-h-10 px-3 rounded-full border text-xs font-semibold ${CHIP[slope]}`}>{slopeLabel}</span>
        )}
      </div>

      {!ok || !near || !far ? (
        <p className="text-xs text-[var(--text)]/65">
          <span className="font-mono text-[var(--warning)]">{t('carry.noData')}</span> — {t('carry.noDataHint')}
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--text)]/65">
            {t('carry.pair', { near: near.contract, far: far.contract, gap: far.daysToExpiry - near.daysToExpiry })}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
              <dt className="text-[var(--text)]/60">{t('carry.annualized')}</dt>
              <dd className={`font-mono tabular-nums text-base ${ann > 0 ? 'text-[var(--positive)]' : ann < 0 ? 'text-[var(--negative)]' : 'text-[var(--text-strong)]'}`}>
                {signedPct(ann)}
              </dd>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
              <dt className="text-[var(--text)]/60">{t('carry.perRoll')}</dt>
              <dd className="font-mono tabular-nums text-base text-[var(--text-strong)]">{signedPct(per)}</dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-[var(--text-strong)]">{t('carry.simTitle')}</h3>
            <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--text)]/70">
              <span>{t('carry.rollsLabel')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                step={1}
                value={rollsText}
                onChange={(e) => setRollsText(e.target.value)}
                className="min-h-10 w-24 bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </label>
            {sim ? (
              <p className="text-xs text-[var(--text-strong)]">
                {t('carry.simResult', {
                  n: sim.rolls,
                  days: sim.daysCovered,
                  dir: sim.total < 0 ? t('carry.dirLose') : t('carry.dirGain'),
                  pct: `${fmtFixed(Math.abs(sim.total) * 100, 2)}%`,
                })}
              </p>
            ) : (
              <p className="text-xs font-mono text-[var(--warning)]">{t('carry.noData')}</p>
            )}
            <p className="text-[11px] text-[var(--text)]/60">{t('carry.simNote')}</p>
          </div>
        </>
      )}

      <details className="text-xs text-[var(--text)]/70">
        <summary className="cursor-pointer select-none min-h-10 flex items-center text-[var(--accent-text)]">{t('carry.explain')}</summary>
        <div className="mt-1 space-y-2 max-w-3xl">
          <code className="block font-mono text-[11px] text-[var(--text-strong)] break-words">{SIMPLE_ROLL_YIELD_FORMULA}</code>
          <p>{t('carry.formula')}</p>
          <p>{t('carry.exp.p1')}</p>
          <p>{t('carry.exp.p2')}</p>
          <p>{t('carry.exp.p3')}</p>
          <p>{t('carry.exp.p4')}</p>
          <p className="text-[11px] text-[var(--text)]/55">{t('carry.exp.src')}</p>
        </div>
      </details>
    </section>
  );
}
