import { useMemo } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { fmtInt, useT } from '../../../i18n';
import { CommodityHeroImage } from '../../common/CommodityHeroImage';
import { formatUpdatedAgo, useSecondsAgo } from '../../common/UpdatedAgo';
import { fmtClock } from '../../common/quoteFormat';
import { SkeletonCards } from '../../ui/Skeleton';
import { buildRows, pricedFirst, sortFamiliar, type SimpleRow } from './model';
import { BigPrice, LIGHT_STYLE, LightBadge, qualityLines, summaryText } from './parts';
import { SimpleDetail } from './SimpleDetail';
import { useSimpleData } from './useSimpleData';
import { useState } from 'react';

function CommodityCard({ row, onOpen }: { row: SimpleRow; onOpen: (id: string) => void }) {
  const t = useT();
  const s = LIGHT_STYLE[row.light];
  const [fresh, trust] = qualityLines(t, row);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row.id)}
        aria-label={`${row.name}. ${summaryText(t, row)}`}
        className="group w-full h-full text-left bg-[var(--surface)] rounded-2xl overflow-hidden border-2 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 hover:bg-[var(--surface-2)] min-h-[44px]"
        style={{ borderColor: s.border }}
      >
        <CommodityHeroImage
          symbol={row.id}
          name={row.name}
          category={row.instrument.category}
          className="h-28 w-full"
          imgClassName="group-hover:scale-105 transition-transform duration-300"
        />
        <div className="p-4 space-y-3">
          <h3 className="text-2xl font-bold text-[var(--text-strong)] leading-tight">{row.name}</h3>
          <BigPrice row={row} t={t} />
          <div>
            <LightBadge light={row.light} t={t} />
          </div>
          <p className="text-lg text-[var(--text-strong)] leading-snug">{summaryText(t, row)}</p>
          <p className="text-base text-[var(--text)] leading-snug">
            {fresh}
            <br />
            {trust}
          </p>
        </div>
      </button>
    </li>
  );
}

function CompactRow({ row, onOpen }: { row: SimpleRow; onOpen: (id: string) => void }) {
  const t = useT();
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row.id)}
        className="w-full min-h-[56px] flex items-center gap-3 text-left px-4 py-3 rounded-xl border-2 border-[#64748B] bg-[var(--surface)] hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
      >
        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: LIGHT_STYLE.gray.dot }} aria-hidden="true" />
        <span className="text-xl font-semibold text-[var(--text-strong)] flex-1">{row.name}</span>
        <span className="text-base text-[var(--text)]">{t('sm.light.gray')}</span>
      </button>
    </li>
  );
}

/** "Giá hôm nay": big cards, familiar Vietnamese farm goods first. Tapping a card opens SimpleDetail. */
export function SimpleHome() {
  const t = useT();
  const { instruments, quotesBySymbol, lastUpdatedAt, loading, loadError } = useTerminal();
  const { today, fx, loading: extraLoading } = useSimpleData();
  const [openId, setOpenId] = useState<string | null>(null);
  const seconds = useSecondsAgo(lastUpdatedAt);

  const rows = useMemo(() => buildRows(instruments, quotesBySymbol, today, fx), [instruments, quotesBySymbol, today, fx]);
  const familiar = useMemo(() => sortFamiliar(rows), [rows]);
  const others = useMemo(() => pricedFirst(rows.filter((r) => !r.familiar)), [rows]);

  const open = rows.find((r) => r.id === openId);
  if (open) return <SimpleDetail row={open} fx={fx} onBack={() => setOpenId(null)} />;

  const familiarPriced = familiar.filter((r) => r.hasPrice);
  const othersPriced = others.filter((r) => r.hasPrice);
  const unpriced = [...familiar, ...others].filter((r) => !r.hasPrice);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-4xl font-extrabold text-[var(--text-strong)]">{t('sm.home.title')}</h1>
        <p className="text-xl text-[var(--text)]">{t('sm.home.sub')}</p>
        <p className="text-lg text-[var(--text)]">{formatUpdatedAgo(seconds)}</p>
        <p className="text-lg text-[#FDE68A] bg-[var(--warning)]/10 border border-[var(--warning)]/40 rounded-xl px-4 py-3">
          {fx
            ? t('sm.home.fxNote', { rate: fmtInt(fx.rate), time: fmtClock(fx.asOf) ?? '—' })
            : extraLoading
              ? t('sm.home.loading')
              : t('sm.home.noFx')}
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="legend">
          {(['green', 'red', 'yellow', 'gray'] as const).map((l) => (
            <li key={l}>
              <LightBadge light={l} t={t} />
            </li>
          ))}
        </ul>
      </header>

      {loading && rows.length === 0 ? (
        <SkeletonCards count={6} />
      ) : loadError && rows.length === 0 ? (
        <p className="text-xl text-[var(--text)]">{t('sm.home.error')}</p>
      ) : (
        <>
          {familiarPriced.length > 0 && (
            <section className="space-y-3" aria-labelledby="sm-familiar">
              <h2 id="sm-familiar" className="text-3xl font-bold text-[var(--text-strong)]">
                {t('sm.home.familiar')}
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {familiarPriced.map((r) => (
                  <CommodityCard key={r.id} row={r} onOpen={setOpenId} />
                ))}
              </ul>
            </section>
          )}
          {othersPriced.length > 0 && (
            <section className="space-y-3" aria-labelledby="sm-others">
              <h2 id="sm-others" className="text-3xl font-bold text-[var(--text-strong)]">
                {t('sm.home.others')}
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {othersPriced.map((r) => (
                  <CommodityCard key={r.id} row={r} onOpen={setOpenId} />
                ))}
              </ul>
            </section>
          )}
          {unpriced.length > 0 && (
            <section className="space-y-3" aria-labelledby="sm-nop">
              <h2 id="sm-nop" className="text-3xl font-bold text-[var(--text-strong)]">
                {t('sm.home.noPrice')}
              </h2>
              <p className="text-lg text-[var(--text)]">{t('sm.home.noPriceNote')}</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {unpriced.map((r) => (
                  <CompactRow key={r.id} row={r} onOpen={setOpenId} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <p className="text-base text-[var(--muted)] pb-4">{t('sm.disc')}</p>
    </div>
  );
}
