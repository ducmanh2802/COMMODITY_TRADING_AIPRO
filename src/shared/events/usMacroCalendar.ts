/**
 * US macro release dates that move every instrument (USD, rates, risk appetite). Explicit data copied from the
 * agencies' OFFICIAL schedules — never estimated. A date not listed here is treated as absent (no warning).
 *
 * FOMC — https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm (retrieved 2026-11-24).
 *   Statement released 14:00 ET on the LAST day of each meeting; only that day is stored.
 *   The Fed notes: "Each meeting date is tentative until confirmed at the meeting immediately preceding it."
 *   2027 lists 8 meetings ending Nov 16-17 (no December meeting printed); Oct 26-27, 2027 is labelled a
 *   "Monetary Policy Strategy Meeting". Next listed: Jan 25-26, 2028 (not stored: outside the published 2027 list).
 *
 * US CPI — https://www.bls.gov/schedule/news_release/cpi.htm (retrieved 2026-11-24), released 08:30 ET.
 *   The page lists releases from Nov 10, 2026 (October 2026 data) through Dec 10, 2027 (November 2027 data).
 *   Earlier 2026 releases are past and no longer listed; later releases are not yet published -> absent.
 */
import type { IsoDate } from '../contracts/dates.ts';

export const FOMC_SOURCE = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
export const US_CPI_SOURCE = 'https://www.bls.gov/schedule/news_release/cpi.htm';

/** FOMC statement days (last day of each meeting), New York date. 14:00 ET. */
export const FOMC_STATEMENT_DATES: readonly IsoDate[] = [
  // 2026: Jan 27-28, Mar 17-18*, Apr 28-29, Jun 16-17*, Jul 28-29, Sep 15-16*, Oct 27-28, Dec 8-9* (* = SEP)
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
  // 2027: Jan 26-27, Mar 16-17, Apr 27-28, Jun 8-9, Jul 27-28, Sep 14-15, Oct 26-27, Nov 16-17
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-11-17',
];
export const FOMC_HOUR_ET = 14;
export const FOMC_MINUTE_ET = 0;

/** BLS CPI release days, New York date. 08:30 ET. */
export const US_CPI_RELEASE_DATES: readonly IsoDate[] = [
  '2026-11-10', // Oct 2026
  '2026-12-10', // Nov 2026
  '2027-01-13', // Dec 2026
  '2027-02-11', // Jan 2027
  '2027-03-10', // Feb 2027
  '2027-04-13', // Mar 2027
  '2027-05-12', // Apr 2027
  '2027-06-10', // May 2027
  '2027-07-14', // Jun 2027
  '2027-08-11', // Jul 2027
  '2027-09-14', // Aug 2027
  '2027-10-14', // Sep 2027
  '2027-11-10', // Oct 2027
  '2027-12-10', // Nov 2027
];
export const US_CPI_HOUR_ET = 8;
export const US_CPI_MINUTE_ET = 30;
