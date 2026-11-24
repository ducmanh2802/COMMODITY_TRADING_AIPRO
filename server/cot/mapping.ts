/**
 * Instrument Master id → CFTC contract market code mapping for the COT module (T25).
 *
 * Verification (2026-11-17)
 * - Every REPORTED code below was confirmed by reading CFTC's own published files and checking that
 *   the row with that `CFTC_Contract_Market_Code` carries the quoted `Market_and_Exchange_Names`
 *   string (copied verbatim; CFTC pads some names with trailing spaces, which are trimmed here):
 *     * Disaggregated Futures-Only, 2026 annual file:
 *       https://www.cftc.gov/files/dea/history/fut_disagg_txt_2026.zip  (f_year.txt; SHA-256 of zip
 *       64f5c820c086b793c34d6527013144958689da731a782eebea4ddc958f610542), 45 weekly rows per code,
 *       2026-01-06 … 2026-11-10.
 *     * Legacy Futures-Only, 2026 annual file:
 *       https://www.cftc.gov/files/dea/history/deacot2026.zip  (annual.txt; SHA-256 of zip
 *       a7f87e9e0f0239a17e5323984de31a8bf429ba8578f6d76062baceb8761ea8ff) — same name for every code.
 *     * Current-week files https://www.cftc.gov/dea/newcot/f_disagg.txt and .../deafut.txt
 *       (report date 2026-11-10) — same codes and names.
 * - The Socrata API (publicreporting.cftc.gov) returned HTTP 403 to every request from the
 *   verification environment, so codes could NOT be re-checked against the Socrata JSON itself. The
 *   Socrata datasets are built from the same CFTC report data and key on the same contract market code.
 *
 * NOT_REPORTED: products listed only on ICE Futures Europe (Brent, Robusta) — a UK exchange, not a
 * CFTC-designated contract market — do not appear in CFTC reports (ICE Futures Europe publishes its
 * own COT report, which this module does not ingest). CME iron ore (TIO) has no row in the 2026 CFTC
 * futures-only files. Do NOT substitute a look-alike market (e.g. NYMEX "BRENT LAST DAY" 06765T is a
 * different, cash-settled NYMEX contract — not ICE Brent).
 */

type CotMappingStatus = 'REPORTED' | 'NOT_REPORTED';

export interface CotMarketEvidence {
  /** `Market_and_Exchange_Names` exactly as returned by CFTC (trailing padding trimmed). */
  marketAndExchangeNames: string;
  /** Latest report date at which the name was observed. */
  observedReportDate: string;
  sources: string[];
  checkedOn: string;
}

export interface CotMarketMapping {
  instrumentId: string;
  status: CotMappingStatus;
  /** 6-character CFTC contract market code, or null when NOT_REPORTED. */
  cftcContractMarketCode: string | null;
  /** Report types available for this market. Disaggregated covers physical commodities only. */
  reportTypes: Array<'DISAGGREGATED' | 'LEGACY'>;
  evidence: CotMarketEvidence | null;
  /** Why the instrument is NOT_REPORTED, or caveats for a REPORTED one. */
  notes: string | null;
}

const CHECKED_ON = '2026-11-17';
const OBSERVED = '2026-11-10';
const SOURCES = [
  'https://www.cftc.gov/files/dea/history/fut_disagg_txt_2026.zip',
  'https://www.cftc.gov/files/dea/history/deacot2026.zip',
];

function reported(
  instrumentId: string,
  code: string,
  marketAndExchangeNames: string,
  notes: string | null = null
): CotMarketMapping {
  return {
    instrumentId,
    status: 'REPORTED',
    cftcContractMarketCode: code,
    reportTypes: ['DISAGGREGATED', 'LEGACY'],
    evidence: { marketAndExchangeNames, observedReportDate: OBSERVED, sources: SOURCES, checkedOn: CHECKED_ON },
    notes,
  };
}

function notReported(instrumentId: string, notes: string): CotMarketMapping {
  return {
    instrumentId,
    status: 'NOT_REPORTED',
    cftcContractMarketCode: null,
    reportTypes: [],
    evidence: null,
    notes,
  };
}

export const COT_MARKET_MAPPINGS: readonly CotMarketMapping[] = [
  // CBOT grains & oilseeds
  reported('CBOT:ZW', '001602', 'WHEAT-SRW - CHICAGO BOARD OF TRADE'),
  reported('CBOT:ZC', '002602', 'CORN - CHICAGO BOARD OF TRADE'),
  reported('CBOT:ZS', '005602', 'SOYBEANS - CHICAGO BOARD OF TRADE'),
  reported('CBOT:ZL', '007601', 'SOYBEAN OIL - CHICAGO BOARD OF TRADE'),
  reported('CBOT:ZM', '026603', 'SOYBEAN MEAL - CHICAGO BOARD OF TRADE'),
  reported('CBOT:ZR', '039601', 'ROUGH RICE - CHICAGO BOARD OF TRADE'),
  // ICE Futures U.S. softs
  reported('ICE:KC', '083731', 'COFFEE C - ICE FUTURES U.S.'),
  reported('ICE:SB', '080732', 'SUGAR NO. 11 - ICE FUTURES U.S.'),
  reported('ICE:CC', '073732', 'COCOA - ICE FUTURES U.S.'),
  reported('ICE:CT', '033661', 'COTTON NO. 2 - ICE FUTURES U.S.'),
  notReported(
    'ICE:RC',
    'Robusta coffee trades on ICE Futures Europe (London), which is not in CFTC COT reports; no "ROBUSTA" market exists in the 2026 CFTC futures-only files. ICE Futures Europe publishes its own COT report (not ingested).'
  ),
  // Metals
  reported('COMEX:HG', '085692', 'COPPER- #1 - COMMODITY EXCHANGE INC.'),
  reported('COMEX:GC', '088691', 'GOLD - COMMODITY EXCHANGE INC.'),
  reported('COMEX:SI', '084691', 'SILVER - COMMODITY EXCHANGE INC.'),
  reported('NYMEX:PL', '076651', 'PLATINUM - NEW YORK MERCANTILE EXCHANGE'),
  notReported(
    'CME:TIO',
    'No market name containing "IRON" appears in the 2026 CFTC Disaggregated or Legacy futures-only files (332 markets in the disaggregated file), so no CFTC COT data was found for CME TIO. Not substituted with a steel market.'
  ),
  notReported(
    'SGX:FEF',
    'SGX TSI Iron Ore futures trade on Singapore Exchange (SGX-DT), which is not a CFTC-designated contract market; SGX products are not in CFTC COT reports. Not substituted with any US market.'
  ),
  // Energy
  reported(
    'NYMEX:CL',
    '067651',
    'WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE',
    'Older history may carry a different market name for the same code (CFTC renamed markets over time); name differences are surfaced as warnings at sync, the code is authoritative.'
  ),
  notReported(
    'ICE:BRN',
    'ICE Brent futures trade on ICE Futures Europe and are not in CFTC COT reports (ICE Futures Europe publishes its own COT). The CFTC market "BRENT LAST DAY - NEW YORK MERCANTILE EXCHANGE" (06765T) is a different NYMEX contract and is intentionally NOT used as a substitute.'
  ),
  reported('NYMEX:NG', '023651', 'NAT GAS NYME - NEW YORK MERCANTILE EXCHANGE'),
];

const BY_ID = new Map(COT_MARKET_MAPPINGS.map((m) => [m.instrumentId, m]));

export function getCotMapping(instrumentId: string): CotMarketMapping | null {
  return BY_ID.get(instrumentId) ?? null;
}
