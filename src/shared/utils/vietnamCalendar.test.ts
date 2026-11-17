import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVietnamEconomicCalendar,
  evaluateVietnamTradingSessions,
  filterVietnamCalendarEvents,
  MARKET_HOLIDAYS,
} from './vietnamCalendar.ts';

test('evaluateVietnamTradingSessions marks CBOT break and Robusta open accurately in Vietnam ICT', () => {
  // 2026-11-17 13:00 UTC = 20:00 ICT (Tue) = 07:00 Chicago CST (CBOT break starts 07:45 CT = 20:45 ICT)
  // London UTC+0: 13:00 London -> ICE Robusta open (09:00-17:30 London)
  const sampleTue = new Date('2026-11-17T13:00:00Z');
  const sessions = evaluateVietnamTradingSessions(sampleTue);
  const robusta = sessions.find((s) => s.id === 'session-mxv-robusta');
  const cbot = sessions.find((s) => s.id === 'session-mxv-cbot');
  assert.ok(robusta && cbot);
  assert.equal(robusta.state, 'OPEN');
  assert.equal(cbot.state, 'OPEN');

  // 2026-11-17 14:00 UTC = 21:00 ICT = 08:00 CST -> CBOT technical break (07:45-08:30 CST = 20:45-21:30 ICT)
  const sampleCbotBreak = new Date('2026-11-17T14:00:00Z');
  const breakSessions = evaluateVietnamTradingSessions(sampleCbotBreak);
  const cbotBreak = breakSessions.find((s) => s.id === 'session-mxv-cbot');
  assert.equal(cbotBreak?.state, 'BREAK');
});

test('evaluateVietnamTradingSessions closes MXV-linked markets on Christmas Day (2026-12-25)', () => {
  const xmas = new Date('2026-12-25T10:00:00+07:00');
  const sessions = evaluateVietnamTradingSessions(xmas);
  for (const s of sessions) {
    assert.equal(s.state, 'HOLIDAY_CLOSED');
  }
});

test('buildVietnamEconomicCalendar returns 2026-2027 holidays and weekly EIA/USDA/VICOFA releases in ICT', () => {
  const anchor = new Date('2026-11-17T15:00:00+07:00');
  const events = buildVietnamEconomicCalendar(anchor, 365);

  const hasThanksgiving = events.some((e) => e.id === 'hol-2026-11-26-us');
  const hasVnNationalDay = events.some((e) => e.id === 'hol-2027-09-02-vn');
  const hasEiaCrude = events.some((e) => e.id.startsWith('eia-crude-'));
  const hasUsdaExport = events.some((e) => e.id.startsWith('usda-export-'));
  const hasVnCoffee = events.some((e) => e.id.startsWith('vn-customs-coffee-'));

  assert.equal(hasThanksgiving, true);
  assert.equal(hasVnNationalDay, true);
  assert.equal(hasEiaCrude, true);
  assert.equal(hasUsdaExport, true);
  assert.equal(hasVnCoffee, true);
  assert.ok(MARKET_HOLIDAYS.some((h) => h.region === 'VIETNAM'));
});

test('filterVietnamCalendarEvents filters cleanly by type, session slot, category, and region', () => {
  const anchor = new Date('2026-11-17T15:00:00+07:00');
  const events = buildVietnamEconomicCalendar(anchor, 365);

  const holidaysOnly = filterVietnamCalendarEvents(events, {
    eventType: 'MARKET_HOLIDAY',
    sessionSlot: 'ALL',
    category: 'ALL',
    region: 'ALL',
  });
  assert.ok(holidaysOnly.length >= 10);
  assert.ok(holidaysOnly.every((e) => e.type === 'MARKET_HOLIDAY'));

  const vnDaytimeReleases = filterVietnamCalendarEvents(events, {
    eventType: 'MACRO_RELEASE',
    sessionSlot: 'ASIA_VN_DAY',
    category: 'ALL',
    region: 'VIETNAM',
  });
  assert.ok(vnDaytimeReleases.length >= 1);
  assert.ok(vnDaytimeReleases.every((e) => e.sessionSlot === 'ASIA_VN_DAY'));
});
