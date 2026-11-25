import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Info } from 'lucide-react';
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

const PAGE = 12;
const MAX_EVENTS = 60;
const CHIPS = 3;

const chipCls =
  'px-1.5 py-0.5 bg-[var(--bg)] hover:bg-[var(--accent)] border border-[var(--border)] rounded text-[11px] font-mono text-[var(--text-strong)] hover:text-[var(--on-accent)] transition-colors';
const linkBtnCls = 'inline-flex items-center min-h-10 px-2 text-xs font-medium text-[var(--accent)] hover:text-[var(--text-strong)]';
const summaryCls = 'text-[11px] text-[var(--accent)] cursor-pointer select-none';

/** Weekday + dd/mm badge parts for a YYYY-MM-DD ICT date. */
function dayParts(dateIso: string, lang: string): { wd: string; dm: string } {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const wd = d.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'short', timeZone: 'UTC' });
  return { wd, dm: `${dateIso.slice(8, 10)}/${dateIso.slice(5, 7)}` };
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
      return { text: 'text-[var(--positive)]', label: tr('cal.state.OPEN') };
    case 'BREAK':
      return { text: 'text-[var(--warning)]', label: tr('cal.state.BREAK') };
    case 'HOLIDAY_CLOSED':
      return { text: 'text-[var(--negative)]', label: tr('cal.state.HOLIDAY_CLOSED') };
    default:
      return { text: 'text-[var(--text)]/55', label: tr('cal.state.CLOSED') };
  }
}

const segBtn = (active: boolean) =>
  `px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
    active ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--text)]/70 hover:text-[var(--text-strong)]'
  }`;

export function VietnamEconomicCalendar({ macroRecords = [] }: VietnamEconomicCalendarProps) {
  const { openInstrumentIn } = useTerminal();
  const { t, lang } = useI18n();
  const [now, setNow] = useState<Date>(() => new Date());

  const [eventType, setEventType] = useState<'ALL' | CalendarEventType>('ALL');
  const [sessionSlot, setSessionSlot] = useState<'ALL' | VietnamSessionSlot>('ALL');
  const [category, setCategory] = useState<'ALL' | ProductCategory | 'MACRO_FX'>('ALL');
  const [region, setRegion] = useState<'ALL' | 'VIETNAM'>('ALL');
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [shown, setShown] = useState<number>(PAGE);

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

  const rawEvents = useMemo(() => buildVietnamEconomicCalendar(now, horizonDays), [now, horizonDays]);

  const filteredEvents = useMemo(
    () => filterVietnamCalendarEvents(rawEvents, { eventType, sessionSlot, category, region }),
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

  const visibleEvents = filteredEvents.slice(0, MAX_EVENTS);
  const pageEvents = visibleEvents.slice(0, shown);
  const groups: { dateIso: string; items: typeof pageEvents }[] = [];
  for (const ev of pageEvents) {
    const last = groups[groups.length - 1];
    if (last && last.dateIso === ev.dateIso) last.items.push(ev);
    else groups.push({ dateIso: ev.dateIso, items: [ev] });
  }
  const resetPage = () => setShown(PAGE);

  return (
    <div className="space-y-4" data-testid="vietnam-economic-calendar">
      {/* 1. Live sessions strip */}
      <section
        aria-label={t('cal.sessions.aria')}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
      >
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('calv.sessions.title')}</h2>
          </div>
          <span className="font-mono text-xs text-[var(--text)]/85 tabular-nums whitespace-nowrap">
            {fmtDate(vnNow.dateIso)} · {String(vnNow.hour).padStart(2, '0')}:
            {String(vnNow.minute).padStart(2, '0')}
          </span>
        </div>
        <details className="border-b border-[var(--border)]/70">
          <summary className={`px-4 py-1.5 ${summaryCls}`}>{t('calv.explain')}</summary>
          <p className="px-4 pb-2 text-xs text-[var(--text)]/70">{t('cal.sessions.subtitle')}</p>
        </details>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 bg-[var(--surface)]">
          {filteredSessions.map((sess) => {
            const st = getSessionStateStyle(sess.state);
            return (
              <div key={sess.id} className="p-3 space-y-1.5 border-b border-r border-[var(--border)]/70">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[11px] text-[var(--text)]/70">{sess.exchange}</span>
                  <span className={`font-mono text-[11px] font-semibold ${st.text}`} title={sess.state}>
                    {st.label}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-[var(--text-strong)] tabular-nums">{sess.ictHoursLabel}</p>
                <div className="flex flex-wrap items-center gap-1">
                  {sess.symbols.slice(0, CHIPS).map((sym) => (
                    <button key={sym} type="button" onClick={() => openInstrumentIn(sym, 'charts')} className={chipCls}>
                      {sym}
                    </button>
                  ))}
                </div>
                <details>
                  <summary
                    className="list-none cursor-pointer text-[var(--muted)] hover:text-[var(--text-strong)] inline-flex"
                    aria-label={t('calv.hoursReason')}
                    title={t('calv.hoursReason')}
                  >
                    <Info className="w-3.5 h-3.5" aria-hidden="true" />
                  </summary>
                  <div className="mt-1.5 space-y-1 text-[11px] text-[var(--text)]/75 leading-relaxed">
                    <p className="font-medium text-[var(--text-strong)]">{sess.labelVi}</p>
                    <p>{sess.stateReason}</p>
                    {sess.symbols.length > CHIPS && (
                      <div className="flex flex-wrap gap-1">
                        {sess.symbols.slice(CHIPS).map((sym) => (
                          <button key={sym} type="button" onClick={() => openInstrumentIn(sym, 'charts')} className={chipCls}>
                            {sym}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Agenda grouped by day */}
      <section
        aria-label={t('cal.events.aria')}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[var(--border)] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('calv.events.title')}</h2>
            </div>
            <span className="font-mono text-xs text-[var(--text)]/70 tabular-nums whitespace-nowrap">
              {t('cal.events.count', { n: filteredEvents.length })}
            </span>
          </div>
          <p className="text-xs text-[var(--text)]/65">{t('calv.intro')}</p>
          <details>
            <summary className={summaryCls}>{t('calv.explain')}</summary>
            <div className="mt-1.5 space-y-1 text-xs text-[var(--text)]/70">
              <p>{t('cal.events.title')}</p>
              <p>{t('cal.events.subtitle')}</p>
            </div>
          </details>

          <div
            role="group"
            aria-label={t('cal.filter.type')}
            className="inline-flex flex-wrap items-center gap-1 bg-[var(--bg)] border border-[var(--border)] rounded-md p-1"
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
                  resetPage();
                  if (tab.id === 'MARKET_HOLIDAY' && horizonDays < 180) setHorizonDays(365);
                }}
                className={segBtn(eventType === tab.id)}
              >
                {t(tab.label)}
              </button>
            ))}
          </div>

          <details>
            <summary className={summaryCls}>{t('calv.filters')}</summary>
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <div
                role="group"
                aria-label={t('cal.filter.session')}
                className="flex flex-wrap items-center gap-1 bg-[var(--bg)] border border-[var(--border)] rounded-md p-1"
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
                    onClick={() => {
                      setSessionSlot(slot.id);
                      resetPage();
                    }}
                    className={segBtn(sessionSlot === slot.id)}
                  >
                    {t(slot.label)}
                  </button>
                ))}
              </div>
              <select
                aria-label={t('cal.filter.category')}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as 'ALL' | ProductCategory | 'MACRO_FX');
                  resetPage();
                }}
                className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)] max-w-full"
              >
                <option value="ALL">{t('cal.cat.ALL')}</option>
                <option value="SOFT_COMMODITIES">{t('cal.cat.SOFT')}</option>
                <option value="AGRICULTURE">{t('cal.cat.AGRI')}</option>
                <option value="ENERGY">{t('cal.cat.ENERGY')}</option>
                <option value="MACRO_FX">{t('cal.cat.MACRO')}</option>
              </select>
              <select
                aria-label={t('cal.horizon')}
                value={horizonDays}
                onChange={(e) => {
                  setHorizonDays(Number(e.target.value));
                  resetPage();
                }}
                className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)] max-w-full"
              >
                <option value={14}>{t('cal.horizon.14')}</option>
                <option value={30}>{t('cal.horizon.30')}</option>
                <option value={365}>{t('cal.horizon.365')}</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setRegion((prev) => (prev === 'ALL' ? 'VIETNAM' : 'ALL'));
                  resetPage();
                }}
                className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  region === 'VIETNAM'
                    ? 'bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--text-strong)]'
                    : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)]/75 hover:text-[var(--text-strong)]'
                }`}
              >
                {region === 'VIETNAM' ? t('cal.region.vn') : t('cal.region.all')}
              </button>
            </div>
          </details>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="p-6 text-xs font-mono text-[var(--text)]/65">{t('cal.empty')}</div>
        ) : (
          <div className="divide-y divide-[var(--border)]/70">
            {groups.map((g) => {
              const dp = dayParts(g.dateIso, lang);
              const isToday = g.dateIso === vnNow.dateIso;
              return (
                <div key={g.dateIso} className="flex gap-3 px-3 sm:px-4 py-3">
                  <div
                    className={`shrink-0 w-12 self-start rounded-md border text-center py-1 ${
                      isToday
                        ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--on-accent)]'
                        : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-strong)]'
                    }`}
                  >
                    <div className="text-[10px] uppercase leading-tight">{dp.wd}</div>
                    <div className="font-mono text-xs font-semibold tabular-nums">{dp.dm}</div>
                  </div>
                  <ul className="flex-1 min-w-0 space-y-2.5">
                    {g.items.map((ev) => {
                      const verifiedRec = findVerifiedMacroMatch(ev.titleEn);
                      const isHoliday = ev.type === 'MARKET_HOLIDAY';
                      const level = ev.impactLevel === 'HIGH' ? 3 : 2;
                      const verifiedFull = verifiedRec
                        ? t('cal.verified', {
                            value: verifiedRec.actualValue,
                            unit: verifiedRec.unit,
                            period: verifiedRec.dataPeriod,
                          })
                        : '';
                      return (
                        <li key={ev.id} className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[11px] text-[var(--text)]/65 tabular-nums shrink-0 w-16 leading-tight">
                              {ev.ictTimeLabel.replace(/\s*ICT\s*$/, '')}
                            </span>
                            <span className="text-xs font-medium text-[var(--text-strong)] line-clamp-2 min-w-0 flex-1">
                              {lang === 'vi' ? ev.titleVi : ev.titleEn}
                            </span>
                            {isHoliday ? (
                              <span className="shrink-0 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border border-[var(--warning)] text-[var(--warning)]">
                                {t('cal.holiday')}
                              </span>
                            ) : (
                              <span
                                className="shrink-0 inline-flex items-center gap-0.5"
                                role="img"
                                aria-label={t('calv.impactAria', { level: impactLabel(ev.impactLevel) })}
                                title={impactLabel(ev.impactLevel)}
                              >
                                {[1, 2, 3].map((i) => (
                                  <span
                                    key={i}
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      i <= level
                                        ? ev.impactLevel === 'HIGH'
                                          ? 'bg-[var(--warning)]'
                                          : 'bg-[var(--accent)]'
                                        : 'bg-[var(--border)]'
                                    }`}
                                  />
                                ))}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 mt-1 pl-[4.5rem]">
                            {ev.relatedSymbols.slice(0, CHIPS).map((sym) => (
                              <button key={sym} type="button" onClick={() => openInstrumentIn(sym, 'charts')} className={chipCls}>
                                {sym}
                              </button>
                            ))}
                            {verifiedRec && (
                              <span className="font-mono text-[11px] text-[var(--positive)]" title={verifiedFull}>
                                {t('calv.verifiedShort', { value: verifiedRec.actualValue, unit: verifiedRec.unit })}
                              </span>
                            )}
                          </div>
                          <details className="pl-[4.5rem] mt-1">
                            <summary
                              className="list-none cursor-pointer text-[var(--muted)] hover:text-[var(--text-strong)] inline-flex"
                              aria-label={t('calv.detail')}
                              title={t('calv.detail')}
                            >
                              <Info className="w-3.5 h-3.5" aria-hidden="true" />
                            </summary>
                            <div className="mt-1.5 space-y-1 text-[11px] text-[var(--text)]/75 leading-relaxed">
                              <p className="text-[var(--text)]/60">{lang === 'vi' ? ev.titleEn : ev.titleVi}</p>
                              <p>
                                <span className="text-[var(--text)]/55">{t('calv.src')}: </span>
                                {ev.sourceAgency}
                                {' · '}
                                <span className="text-[var(--text)]/55">{t('calv.cadence')}: </span>
                                {ev.cadenceLabel}
                              </p>
                              <p>
                                <span className="text-[var(--text)]/55">{t('calv.session')}: </span>
                                {sessionLabel(ev.sessionSlot)}
                              </p>
                              <p>
                                <span className="text-[var(--text)]/55">{t('calv.note')}: </span>
                                {ev.mxvImpactNote}
                              </p>
                              {verifiedRec && <p className="font-mono text-[var(--positive)]">{verifiedFull}</p>}
                              {ev.relatedSymbols.length > CHIPS && (
                                <div className="flex flex-wrap gap-1">
                                  {ev.relatedSymbols.slice(CHIPS, 5).map((sym) => (
                                    <button key={sym} type="button" onClick={() => openInstrumentIn(sym, 'charts')} className={chipCls}>
                                      {sym}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            {visibleEvents.length > PAGE && (
              <div className="px-4 py-2.5 text-center">
                {shown < visibleEvents.length ? (
                  <button type="button" onClick={() => setShown((n) => n + PAGE)} className={linkBtnCls}>
                    {t('calv.more', { n: Math.min(PAGE, visibleEvents.length - shown) })}
                  </button>
                ) : (
                  <button type="button" onClick={resetPage} className={linkBtnCls}>
                    {t('calv.less')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
