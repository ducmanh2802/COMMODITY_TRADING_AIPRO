import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { FundamentalMacroRecord } from '../../shared/types/analysis';
import type { ProductCategory } from '../../shared/types/instrument';
import { VIETNAM_TIMEZONE } from '../../shared/utils/time';
import {
  buildVietnamEconomicCalendar,
  evaluateVietnamTradingSessions,
  filterVietnamCalendarEvents,
  getZonedParts,
  type CalendarEventType,
  type SessionLiveState,
  type VietnamSessionSlot,
} from '../../shared/utils/vietnamCalendar';
import { fmtDate, hasKey, tr, useI18n } from '../../i18n';

interface VietnamEconomicCalendarProps {
  macroRecords?: FundamentalMacroRecord[];
}

const sessionLabel = (slot: VietnamSessionSlot): string => tr(`cal.slot.${slot}`);

/** Impact level label (HIGH/MEDIUM/LOW → Vietnamese); unknown levels shown as-is. */
const impactLabel = (level: string): string => {
  const key = `cal.impact.${level}`;
  return hasKey(key) ? tr(key) : level;
};

function getSessionStateStyle(state: SessionLiveState): { text: string; label: string } {
  switch (state) {
    case 'OPEN':
      return { text: 'text-[#22C55E]', label: tr('cal.state.OPEN') };
    case 'BREAK':
      return { text: 'text-[#F59E0B]', label: tr('cal.state.BREAK') };
    case 'HOLIDAY_CLOSED':
      return { text: 'text-[#EF4444]', label: tr('cal.state.HOLIDAY_CLOSED') };
    default:
      return { text: 'text-[#E5E7EB]/55', label: tr('cal.state.CLOSED') };
  }
}

export function VietnamEconomicCalendar({ macroRecords = [] }: VietnamEconomicCalendarProps) {
  const { openInstrumentIn } = useTerminal();
  const { t, lang } = useI18n();
  const [now, setNow] = useState<Date>(() => new Date());

  const [eventType, setEventType] = useState<'ALL' | CalendarEventType>('ALL');
  const [sessionSlot, setSessionSlot] = useState<'ALL' | VietnamSessionSlot>('ALL');
  const [category, setCategory] = useState<'ALL' | ProductCategory | 'MACRO_FX'>('ALL');
  const [region, setRegion] = useState<'ALL' | 'VIETNAM'>('ALL');
  const [horizonDays, setHorizonDays] = useState<number>(30);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const vnNow = useMemo(() => getZonedParts(now, VIETNAM_TIMEZONE), [now]);
  const liveSessions = useMemo(() => evaluateVietnamTradingSessions(now), [now]);

  const filteredSessions = useMemo(() => {
    return liveSessions.filter((s) => {
      if (sessionSlot !== 'ALL' && s.sessionSlot !== sessionSlot) return false;
      if (category !== 'ALL' && category !== 'MACRO_FX' && s.category !== category) return false;
      return true;
    });
  }, [liveSessions, sessionSlot, category]);

  const rawEvents = useMemo(
    () => buildVietnamEconomicCalendar(now, horizonDays),
    [now, horizonDays]
  );

  const filteredEvents = useMemo(
    () =>
      filterVietnamCalendarEvents(rawEvents, {
        eventType,
        sessionSlot,
        category,
        region,
      }),
    [rawEvents, eventType, sessionSlot, category, region]
  );

  // Attach any verified EIA/USDA actuals from store if matching source keywords appear
  const findVerifiedMacroMatch = (titleEn: string): FundamentalMacroRecord | undefined => {
    if (macroRecords.length === 0) return undefined;
    if (titleEn.includes('Petroleum')) {
      return macroRecords.find((r) => r.dataset.includes('EIA_US_CRUDE_STOCKS'));
    }
    if (titleEn.includes('Natural Gas')) {
      return macroRecords.find((r) => r.dataset.includes('EIA_US_NATURAL_GAS_STORAGE'));
    }
    return undefined;
  };

  return (
    <div className="space-y-6" data-testid="vietnam-economic-calendar">
      {/* 1. Live Vietnam Commodity Sessions Bar (ICT / UTC+7) */}
      <section
        aria-label={t('cal.sessions.aria')}
        className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#263244] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#6366F1] shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                {t('cal.sessions.title')}
              </h2>
              <p className="text-xs text-[#E5E7EB]/60">
                {t('cal.sessions.subtitle')}
              </p>
            </div>
          </div>
          <span className="font-mono text-xs text-[#E5E7EB]/85 tabular-nums whitespace-nowrap">
            {fmtDate(vnNow.dateIso)} · {String(vnNow.hour).padStart(2, '0')}:
            {String(vnNow.minute).padStart(2, '0')} ICT
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-[#263244]">
          {filteredSessions.map((sess) => {
            const st = getSessionStateStyle(sess.state);
            return (
              <div key={sess.id} className="p-4 space-y-2 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-[#E5E7EB]/60">
                      {sess.exchange}
                    </span>
                    <span className={`font-mono text-xs font-semibold ${st.text}`} title={sess.state}>
                      {st.label}
                    </span>
                  </div>
                  <h3 className="text-xs font-semibold text-white leading-snug">{sess.labelVi}</h3>
                  <p className="font-mono text-[11px] text-[#E5E7EB]/80 tabular-nums">
                    {sess.ictHoursLabel}
                  </p>
                  <p className="text-[11px] text-[#E5E7EB]/60 leading-relaxed">
                    {sess.stateReason}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#263244]/70 flex flex-wrap gap-1.5">
                  {sess.symbols.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => openInstrumentIn(sym, 'charts')}
                      className="px-2 py-1 bg-[#0B0E14] hover:bg-[#6366F1] border border-[#263244] rounded text-[11px] font-mono text-white transition-colors"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Filtered Economic Calendar & Major Market Holidays */}
      <section
        aria-label={t('cal.events.aria')}
        className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
      >
        <div className="px-4 py-3.5 border-b border-[#263244] space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <CalendarDays className="w-4 h-4 text-[#6366F1] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {t('cal.events.title')}
                </h2>
                <p className="text-xs text-[#E5E7EB]/60">
                  {t('cal.events.subtitle')}
                </p>
              </div>
            </div>

            <span className="font-mono text-xs text-[#E5E7EB]/70 tabular-nums whitespace-nowrap">
              {t('cal.events.count', { n: filteredEvents.length })}
            </span>
          </div>

          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {/* Event Type Segmented Control */}
            <div
              role="group"
              aria-label={t('cal.filter.type')}
              className="flex flex-wrap items-center gap-1 bg-[#0B0E14] border border-[#263244] rounded-md p-1"
            >
              {(
                [
                  { id: 'ALL', label: 'cal.filter.allEvents' },
                  { id: 'MACRO_RELEASE', label: 'cal.filter.macro' },
                  { id: 'MARKET_HOLIDAY', label: 'cal.filter.holidays' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setEventType(tab.id);
                    if (tab.id === 'MARKET_HOLIDAY' && horizonDays < 180) {
                      setHorizonDays(365);
                    }
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    eventType === tab.id
                      ? 'bg-[#6366F1] text-white'
                      : 'text-[#E5E7EB]/70 hover:text-white'
                  }`}
                >
                  {t(tab.label)}
                </button>
              ))}
            </div>

            {/* Session Window Segmented Control */}
            <div
              role="group"
              aria-label={t('cal.filter.session')}
              className="flex flex-wrap items-center gap-1 bg-[#0B0E14] border border-[#263244] rounded-md p-1"
            >
              {(
                [
                  { id: 'ALL', label: 'cal.filter.allSessions' },
                  { id: 'ASIA_VN_DAY', label: 'cal.filter.vnDay' },
                  { id: 'EU_ROBUSTA', label: 'cal.filter.euRobusta' },
                  { id: 'US_NIGHT', label: 'cal.filter.usNight' },
                ] as const
              ).map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSessionSlot(slot.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    sessionSlot === slot.id
                      ? 'bg-[#172033] text-white border border-[#6366F1]/60'
                      : 'text-[#E5E7EB]/65 hover:text-white border border-transparent'
                  }`}
                >
                  {t(slot.label)}
                </button>
              ))}
            </div>

            {/* Category Selector */}
            <select
              aria-label={t('cal.filter.category')}
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as 'ALL' | ProductCategory | 'MACRO_FX')
              }
              className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white max-w-full"
            >
              <option value="ALL">{t('cal.cat.ALL')}</option>
              <option value="SOFT_COMMODITIES">{t('cal.cat.SOFT')}</option>
              <option value="AGRICULTURE">{t('cal.cat.AGRI')}</option>
              <option value="ENERGY">{t('cal.cat.ENERGY')}</option>
              <option value="MACRO_FX">{t('cal.cat.MACRO')}</option>
            </select>

            {/* Horizon Selector */}
            <select
              aria-label={t('cal.horizon')}
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value))}
              className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white max-w-full"
            >
              <option value={14}>{t('cal.horizon.14')}</option>
              <option value={30}>{t('cal.horizon.30')}</option>
              <option value={365}>{t('cal.horizon.365')}</option>
            </select>

            {/* Vietnam Scope Toggle */}
            <button
              type="button"
              onClick={() => setRegion((prev) => (prev === 'ALL' ? 'VIETNAM' : 'ALL'))}
              className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                region === 'VIETNAM'
                  ? 'bg-[#6366F1]/20 border-[#6366F1] text-white'
                  : 'bg-[#0B0E14] border-[#263244] text-[#E5E7EB]/75 hover:text-white'
              }`}
            >
              {region === 'VIETNAM' ? t('cal.region.vn') : t('cal.region.all')}
            </button>
          </div>
        </div>

        {/* Results Table (Desktop) & Stacked Cards (Mobile) */}
        {filteredEvents.length === 0 ? (
          <div className="p-6 text-xs font-mono text-[#E5E7EB]/65">
            {t('cal.empty')}
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-[#263244]/70">
              {filteredEvents.slice(0, 60).map((ev) => {
                const verifiedRec = findVerifiedMacroMatch(ev.titleEn);
                const isHoliday = ev.type === 'MARKET_HOLIDAY';
                return (
                  <article key={ev.id} className="p-4 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-mono tabular-nums">
                        <span className="text-white font-medium">{fmtDate(ev.dateIso)}</span>
                        <span className="text-[#E5E7EB]/60 ml-2 text-[11px]">{ev.ictTimeLabel}</span>
                      </div>
                      <span
                        className={`font-mono text-[11px] font-semibold shrink-0 ${
                          isHoliday
                            ? 'text-[#EF4444]'
                            : ev.impactLevel === 'HIGH'
                              ? 'text-[#F59E0B]'
                              : 'text-[#6366F1]'
                        }`}
                      >
                        {isHoliday ? t('cal.holiday') : t('cal.macro', { level: impactLabel(ev.impactLevel) })}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-medium text-white">{lang === 'vi' ? ev.titleVi : ev.titleEn}</h3>
                      <p className="text-[11px] text-[#E5E7EB]/55 mt-0.5">
                        {lang === 'vi' ? ev.titleEn : ev.titleVi} · {ev.sourceAgency} · {sessionLabel(ev.sessionSlot)}
                      </p>
                    </div>

                    <p className="text-[#E5E7EB]/80 leading-relaxed">{ev.mxvImpactNote}</p>

                    {verifiedRec && (
                      <p className="font-mono text-[11px] text-[#22C55E]">
                        {t('cal.verified', { value: verifiedRec.actualValue, unit: verifiedRec.unit, period: verifiedRec.dataPeriod })}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {ev.relatedSymbols.slice(0, 5).map((sym) => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => openInstrumentIn(sym, 'charts')}
                          className="px-2 py-0.5 bg-[#0B0E14] hover:bg-[#6366F1] border border-[#263244] rounded text-[11px] font-mono text-white transition-colors"
                        >
                          {sym}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[880px]">
                <thead>
                  <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                    <th className="py-2.5 px-4 font-medium">{t('cal.col.datetime')}</th>
                    <th className="py-2.5 px-3 font-medium">{t('cal.col.type')}</th>
                    <th className="py-2.5 px-3 font-medium">{t('cal.col.event')}</th>
                    <th className="py-2.5 px-3 font-medium">{t('cal.col.session')}</th>
                    <th className="py-2.5 px-3 font-medium">{t('cal.col.contracts')}</th>
                    <th className="py-2.5 px-4 font-medium">{t('cal.col.impact')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#263244]/70 text-xs">
                  {filteredEvents.slice(0, 60).map((ev) => {
                    const verifiedRec = findVerifiedMacroMatch(ev.titleEn);
                    const isHoliday = ev.type === 'MARKET_HOLIDAY';
                    return (
                      <tr key={ev.id} className="hover:bg-[#172033]/40 transition-colors align-top">
                        <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                          <div className="text-white font-medium">{fmtDate(ev.dateIso)}</div>
                          <div className="text-[11px] text-[#E5E7EB]/65">{ev.ictTimeLabel}</div>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`font-mono text-[11px] font-semibold ${
                              isHoliday
                                ? 'text-[#EF4444]'
                                : ev.impactLevel === 'HIGH'
                                  ? 'text-[#F59E0B]'
                                  : 'text-[#6366F1]'
                            }`}
                          >
                            {isHoliday ? t('cal.holiday') : t('cal.macro', { level: impactLabel(ev.impactLevel) })}
                          </span>
                          <div className="text-[11px] text-[#E5E7EB]/50 mt-0.5">
                            {ev.sourceAgency}
                          </div>
                        </td>

                        <td className="py-3 px-3 max-w-xs">
                          <div className="font-medium text-white">{lang === 'vi' ? ev.titleVi : ev.titleEn}</div>
                          <div className="text-[11px] text-[#E5E7EB]/50 mt-0.5">
                            {lang === 'vi' ? ev.titleEn : ev.titleVi} · {ev.cadenceLabel}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-[#E5E7EB]/75 whitespace-nowrap">
                          {sessionLabel(ev.sessionSlot)}
                        </td>

                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {ev.relatedSymbols.slice(0, 5).map((sym) => (
                              <button
                                key={sym}
                                type="button"
                                onClick={() => openInstrumentIn(sym, 'charts')}
                                className="px-1.5 py-0.5 bg-[#0B0E14] hover:bg-[#6366F1] border border-[#263244] rounded text-[11px] font-mono text-white transition-colors"
                              >
                                {sym}
                              </button>
                            ))}
                          </div>
                        </td>

                        <td className="py-3 px-4 max-w-md space-y-1">
                          <p className="text-[#E5E7EB]/80 leading-relaxed">{ev.mxvImpactNote}</p>
                          {verifiedRec && (
                            <p className="font-mono text-[11px] text-[#22C55E]">
                              {t('cal.verified', { value: verifiedRec.actualValue, unit: verifiedRec.unit, period: verifiedRec.dataPeriod })}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
