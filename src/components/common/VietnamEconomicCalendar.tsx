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

interface VietnamEconomicCalendarProps {
  macroRecords?: FundamentalMacroRecord[];
}

const SESSION_LABELS: Record<VietnamSessionSlot, string> = {
  ASIA_VN_DAY: 'Asia / VN Day (06:00–15:00 ICT)',
  EU_ROBUSTA: 'EU Overlap / Robusta (15:00–20:00 ICT)',
  US_NIGHT: 'US Prime / Night (20:00–05:00 ICT)',
};

function getSessionStateStyle(state: SessionLiveState): { text: string; label: string } {
  switch (state) {
    case 'OPEN':
      return { text: 'text-[#22C55E]', label: 'OPEN' };
    case 'BREAK':
      return { text: 'text-[#F59E0B]', label: 'BREAK' };
    case 'HOLIDAY_CLOSED':
      return { text: 'text-[#EF4444]', label: 'HOLIDAY_CLOSED' };
    default:
      return { text: 'text-[#E5E7EB]/55', label: 'CLOSED' };
  }
}

export function VietnamEconomicCalendar({ macroRecords = [] }: VietnamEconomicCalendarProps) {
  const { openInstrumentIn } = useTerminal();
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
        aria-label="Vietnam Commodity Trading Sessions (ICT)"
        className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#263244] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#6366F1] shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                Phiên Giao dịch Hàng hóa Việt Nam (Giờ ICT · UTC+7)
              </h2>
              <p className="text-xs text-[#E5E7EB]/60">
                Trạng thái sàn liên thông MXV tự động điều chỉnh theo giờ mùa hè/đông Mỹ &amp; Anh
              </p>
            </div>
          </div>
          <span className="font-mono text-xs text-[#E5E7EB]/85 tabular-nums whitespace-nowrap">
            {vnNow.dateIso} · {String(vnNow.hour).padStart(2, '0')}:
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
                    <span className={`font-mono text-xs font-semibold ${st.text}`}>
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
        aria-label="Vietnam Economic Calendar & Market Holidays"
        className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden"
      >
        <div className="px-4 py-3.5 border-b border-[#263244] space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <CalendarDays className="w-4 h-4 text-[#6366F1] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Lịch Kinh tế &amp; Ngày nghỉ Lễ Thị trường Hàng hóa (ICT)
                </h2>
                <p className="text-xs text-[#E5E7EB]/60">
                  Lọc theo phiên giao dịch Việt Nam, báo cáo vĩ mô EIA/USDA/VICOFA và lịch nghỉ lễ MXV · Mỹ · Anh (2026–2027)
                </p>
              </div>
            </div>

            <span className="font-mono text-xs text-[#E5E7EB]/70 tabular-nums whitespace-nowrap">
              {filteredEvents.length} sự kiện / ngày nghỉ
            </span>
          </div>

          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {/* Event Type Segmented Control */}
            <div
              role="group"
              aria-label="Filter by calendar event type"
              className="flex flex-wrap items-center gap-1 bg-[#0B0E14] border border-[#263244] rounded-md p-1"
            >
              {(
                [
                  { id: 'ALL', label: 'All Events' },
                  { id: 'MACRO_RELEASE', label: 'Macro Releases' },
                  { id: 'MARKET_HOLIDAY', label: 'Market Holidays' },
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
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Session Window Segmented Control */}
            <div
              role="group"
              aria-label="Filter by Vietnam ICT session window"
              className="flex flex-wrap items-center gap-1 bg-[#0B0E14] border border-[#263244] rounded-md p-1"
            >
              {(
                [
                  { id: 'ALL', label: 'All Sessions' },
                  { id: 'ASIA_VN_DAY', label: 'VN Daytime (06–15h)' },
                  { id: 'EU_ROBUSTA', label: 'EU Robusta (15–20h)' },
                  { id: 'US_NIGHT', label: 'US Night (20–05h)' },
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
                  {slot.label}
                </button>
              ))}
            </div>

            {/* Category Selector */}
            <select
              aria-label="Filter calendar by commodity category"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as 'ALL' | ProductCategory | 'MACRO_FX')
              }
              className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white max-w-full"
            >
              <option value="ALL">All Commodities</option>
              <option value="SOFT_COMMODITIES">Softs (Coffee / Rubber)</option>
              <option value="AGRICULTURE">Agri (Soy / Corn / Wheat)</option>
              <option value="ENERGY">Energy (WTI / Brent / Gas)</option>
              <option value="MACRO_FX">USD/VND &amp; Macro</option>
            </select>

            {/* Horizon Selector */}
            <select
              aria-label="Select calendar horizon"
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value))}
              className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white max-w-full"
            >
              <option value={14}>Next 14 Days</option>
              <option value={30}>Next 30 Days</option>
              <option value={365}>Full Year Holidays (365d)</option>
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
              {region === 'VIETNAM' ? 'Vietnam Focus Only: ON' : 'All Regions'}
            </button>
          </div>
        </div>

        {/* Results Table (Desktop) & Stacked Cards (Mobile) */}
        {filteredEvents.length === 0 ? (
          <div className="p-6 text-xs font-mono text-[#E5E7EB]/65">
            No scheduled events or holidays match your active Vietnam session filters. Broaden the session window or extend horizon to 365 days.
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
                        <span className="text-white font-medium">{ev.dateIso}</span>
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
                        {isHoliday ? 'HOLIDAY' : `MACRO · ${ev.impactLevel}`}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-medium text-white">{ev.titleVi}</h3>
                      <p className="text-[11px] text-[#E5E7EB]/55 mt-0.5">
                        {ev.titleEn} · {ev.sourceAgency} · {SESSION_LABELS[ev.sessionSlot]}
                      </p>
                    </div>

                    <p className="text-[#E5E7EB]/80 leading-relaxed">{ev.mxvImpactNote}</p>

                    {verifiedRec && (
                      <p className="font-mono text-[11px] text-[#22C55E]">
                        Verified Actual: {verifiedRec.actualValue} {verifiedRec.unit} ({verifiedRec.dataPeriod})
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
                    <th className="py-2.5 px-4 font-medium">Date &amp; Time (ICT)</th>
                    <th className="py-2.5 px-3 font-medium">Type</th>
                    <th className="py-2.5 px-3 font-medium">Event / Market Holiday</th>
                    <th className="py-2.5 px-3 font-medium">Session Window</th>
                    <th className="py-2.5 px-3 font-medium">Contracts</th>
                    <th className="py-2.5 px-4 font-medium">MXV Impact &amp; Verified Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#263244]/70 text-xs">
                  {filteredEvents.slice(0, 60).map((ev) => {
                    const verifiedRec = findVerifiedMacroMatch(ev.titleEn);
                    const isHoliday = ev.type === 'MARKET_HOLIDAY';
                    return (
                      <tr key={ev.id} className="hover:bg-[#172033]/40 transition-colors align-top">
                        <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                          <div className="text-white font-medium">{ev.dateIso}</div>
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
                            {isHoliday ? 'HOLIDAY' : `MACRO · ${ev.impactLevel}`}
                          </span>
                          <div className="text-[11px] text-[#E5E7EB]/50 mt-0.5">
                            {ev.sourceAgency}
                          </div>
                        </td>

                        <td className="py-3 px-3 max-w-xs">
                          <div className="font-medium text-white">{ev.titleVi}</div>
                          <div className="text-[11px] text-[#E5E7EB]/50 mt-0.5">
                            {ev.titleEn} · {ev.cadenceLabel}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-[#E5E7EB]/75 whitespace-nowrap">
                          {SESSION_LABELS[ev.sessionSlot]}
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
                              Verified Actual: {verifiedRec.actualValue} {verifiedRec.unit} (
                              {verifiedRec.dataPeriod})
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
