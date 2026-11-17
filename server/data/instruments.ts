import type {
  ContractSpecification,
  InstrumentDefinition,
} from '../../src/shared/types/instrument.ts';

/**
 * Instrument Master seed data (T03), checked 2026-11-17.
 *
 * Verification policy:
 * - A specification is `VERIFIED` only when contract size, minimum tick and settlement method
 *   were read on an official exchange document (cmegroup.com / ice.com). `dataSource` holds that URL.
 * - ICE pages (ice.com/products/...) were fetched and read directly.
 * - cmegroup.com refused direct connections from the verification environment (connection reset /
 *   timeout), so CME/CBOT/COMEX/NYMEX figures were read from the official CME rulebook / fact-card
 *   text as returned by a domain-restricted search of cmegroup.com, and cross-checked against the
 *   MXV contract pages (mxv.com.vn), which republish the same CBOT/COMEX/NYMEX specifications.
 *   Re-confirm against the live CME contract-spec page before using for live risk.
 * - `tickValue` = contractSize x minimumTickSize (converted to USD). Every value below passes that
 *   check; where the exchange page states the USD value it matches.
 * - expirationDate / firstNoticeDate / marginRequirement stay null: they are per contract month or
 *   change frequently. Listed months and last-trading-day rules live in CONTRACT_CALENDAR_RULES.
 * - MXV mappings are `VERIFIED` only when the MXV product page shows the code and the linked
 *   foreign exchange; the URL is in `notes`.
 */

const CHECKED_ON = '2026-11-17';

const CME_GRAIN_HOURS =
  'CME Globex: Sun-Fri 19:00-07:45 CT and Mon-Fri 08:30-13:20 CT (settlement 13:15 CT), per CME Grain and Oilseed fact card';
const CME_METALS_ENERGY_HOURS =
  'CME Globex: Sun-Fri 18:00-17:00 ET (17:00-16:00 CT) with a 60-minute daily break from 17:00 ET, per CME fact cards';

const MXV_PENDING = 'Not yet confirmed on an MXV source.';

interface VerifiedSpecInput {
  contractSize: number;
  contractSizeUnit: string;
  minimumTickSize: number;
  tickValue: number;
  quotationUnit: string;
  tradingHoursTimezone: string;
  tradingHoursSummary: string;
  settlementMethod: 'PHYSICAL' | 'CASH';
  dataSource: string;
}

function verifiedSpec(input: VerifiedSpecInput): ContractSpecification {
  return {
    ...input,
    tradingCurrency: 'USD',
    expirationDate: null,
    firstNoticeDate: null,
    marginRequirement: null,
    marginCurrency: null,
    verificationStatus: 'VERIFIED',
  };
}

export const INITIAL_INSTRUMENTS: InstrumentDefinition[] = [
  // AGRICULTURE (CBOT)
  {
    id: 'CBOT:ZS',
    productName: 'Soybeans',
    category: 'AGRICULTURE',
    exchange: 'CBOT',
    exchangeSymbol: 'ZS',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 5000,
      contractSizeUnit: 'bushels',
      minimumTickSize: 0.25,
      tickValue: 12.5,
      quotationUnit: 'cents/bushel',
      tradingHoursTimezone: 'America/Chicago',
      tradingHoursSummary: CME_GRAIN_HOURS,
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/rulebook/CBOT/II/11/11.pdf',
    }),
    mxvMapping: {
      mxvSymbol: 'ZSE',
      internationalSymbol: 'ZS',
      internationalExchange: 'CBOT',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Đậu tương CBOT" code ZSE, linked exchange CBOT, 5000 bu, tick 0.25 cent/bu. Source: https://mxv.com.vn/hang-hoa/nong-san/dau-tuong.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'CBOT:ZM',
    productName: 'Soybean Meal',
    category: 'AGRICULTURE',
    exchange: 'CBOT',
    exchangeSymbol: 'ZM',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 100,
      contractSizeUnit: 'short tons',
      minimumTickSize: 0.1,
      tickValue: 10,
      quotationUnit: 'USD/short ton',
      tradingHoursTimezone: 'America/Chicago',
      tradingHoursSummary: CME_GRAIN_HOURS,
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/rulebook/CBOT/II/13/13.pdf',
    }),
    mxvMapping: {
      mxvSymbol: 'ZME',
      internationalSymbol: 'ZM',
      internationalExchange: 'CBOT',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Khô đậu tương CBOT" code ZME, linked exchange CBOT, 100 short tons, tick 0.1 USD/short ton. Source: https://mxv.com.vn/hang-hoa/nong-san/kho-dau-tuong.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'CBOT:ZL',
    productName: 'Soybean Oil',
    category: 'AGRICULTURE',
    exchange: 'CBOT',
    exchangeSymbol: 'ZL',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 60000,
      contractSizeUnit: 'lbs',
      minimumTickSize: 0.01,
      tickValue: 6,
      quotationUnit: 'cents/lb',
      tradingHoursTimezone: 'America/Chicago',
      tradingHoursSummary: CME_GRAIN_HOURS,
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/rulebook/CBOT/II/12/12.pdf',
    }),
    mxvMapping: {
      mxvSymbol: 'ZLE',
      internationalSymbol: 'ZL',
      internationalExchange: 'CBOT',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Dầu đậu tương CBOT" code ZLE, 60,000 lb, tick 0.01 cent/lb. Source: https://mxv.com.vn/hang-hoa/nong-san/dau-dau-tuong.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'CBOT:ZC',
    productName: 'Corn',
    category: 'AGRICULTURE',
    exchange: 'CBOT',
    exchangeSymbol: 'ZC',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 5000,
      contractSizeUnit: 'bushels',
      minimumTickSize: 0.25,
      tickValue: 12.5,
      quotationUnit: 'cents/bushel',
      tradingHoursTimezone: 'America/Chicago',
      tradingHoursSummary: CME_GRAIN_HOURS,
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/rulebook/CBOT/I/10.pdf',
    }),
    mxvMapping: {
      mxvSymbol: 'ZCE',
      internationalSymbol: 'ZC',
      internationalExchange: 'CBOT',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Ngô CBOT" code ZCE, linked exchange CBOT, 5000 bu, tick 0.25 cent/bu. Source: https://mxv.com.vn/hang-hoa/nong-san/ngo.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'CBOT:ZW',
    productName: 'Wheat',
    category: 'AGRICULTURE',
    exchange: 'CBOT',
    exchangeSymbol: 'ZW',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 5000,
      contractSizeUnit: 'bushels (Chicago SRW)',
      minimumTickSize: 0.25,
      tickValue: 12.5,
      quotationUnit: 'cents/bushel',
      tradingHoursTimezone: 'America/Chicago',
      tradingHoursSummary: CME_GRAIN_HOURS,
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/rulebook/CBOT/II/14/14.pdf',
    }),
    mxvMapping: {
      mxvSymbol: 'ZWA',
      internationalSymbol: 'ZW',
      internationalExchange: 'CBOT',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Lúa mì Chicago Soft Red Winter CBOT" code ZWA, 5000 bu, tick 0.25 cent/bu. Source: https://mxv.com.vn/hang-hoa/nong-san/lua-mi.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'CBOT:ZR',
    productName: 'Rough Rice',
    category: 'AGRICULTURE',
    exchange: 'CBOT',
    exchangeSymbol: 'ZR',
    contractMonth: null,
    contractYear: null,
    // Listed on MXV as ZRE (en.mxv.com.vn product page with an active expiry schedule into 2027).
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 2000,
      contractSizeUnit: 'cwt (hundredweight)',
      minimumTickSize: 0.005,
      tickValue: 10,
      quotationUnit: 'USD/cwt',
      tradingHoursTimezone: 'America/Chicago',
      tradingHoursSummary: CME_GRAIN_HOURS,
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/rulebook/CBOT/II/17/17.pdf',
    }),
    mxvMapping: {
      mxvSymbol: 'ZRE',
      internationalSymbol: 'ZR',
      internationalExchange: 'CBOT',
      mappingStatus: 'VERIFIED',
      notes: `MXV "CBOT Rough Rice" code ZRE, linked exchange CBOT, 2000 cwt, tick 0.5 cent/cwt. Source: https://en.mxv.com.vn/product/grains/rough-rice.html (checked ${CHECKED_ON}). Not shown in the Vietnamese-language product menu on mxv.com.vn; confirm with MXV before trading.`,
    },
    enabled: true,
  },

  // SOFT COMMODITIES (ICE)
  {
    id: 'ICE:KC',
    productName: 'Coffee Arabica',
    category: 'SOFT_COMMODITIES',
    exchange: 'ICE',
    exchangeSymbol: 'KC',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 37500,
      contractSizeUnit: 'lbs',
      minimumTickSize: 0.05,
      tickValue: 18.75,
      quotationUnit: 'cents/lb',
      tradingHoursTimezone: 'America/New_York',
      tradingHoursSummary: 'ICE Futures U.S.: 04:15-13:30 ET (pre-open 20:00 ET prior day)',
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.ice.com/products/15/Coffee-C-Futures',
    }),
    mxvMapping: {
      mxvSymbol: 'KCE',
      internationalSymbol: 'KC',
      internationalExchange: 'ICE',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Cà phê Arabica ICE US (Coffee C)" code KCE, linked exchange ICEUS, 37,500 lb, tick 0.05 cent/lb. Source: https://mxv.com.vn/hang-hoa/nguyen-lieu-cong-nghiep/ca-phe-arabica.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'ICE:RC',
    productName: 'Coffee Robusta',
    category: 'SOFT_COMMODITIES',
    exchange: 'ICE',
    exchangeSymbol: 'RC',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 10,
      contractSizeUnit: 'metric tons',
      minimumTickSize: 1,
      tickValue: 10,
      quotationUnit: 'USD/MT',
      tradingHoursTimezone: 'Europe/London',
      tradingHoursSummary: 'ICE Futures Europe: 09:00-17:30 London (pre-open 01:00)',
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.ice.com/products/37089079/Robusta-Coffee-Futures',
    }),
    mxvMapping: {
      mxvSymbol: 'LRC',
      internationalSymbol: 'RC',
      internationalExchange: 'ICE',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Cà phê Robusta ICE" code LRC, linked exchange ICEEU, 10 t, tick 1 USD/t. Source: https://mxv.com.vn/hang-hoa/nguyen-lieu-cong-nghiep/ca-phe-robusta.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'ICE:SB',
    productName: 'Sugar',
    category: 'SOFT_COMMODITIES',
    exchange: 'ICE',
    exchangeSymbol: 'SB',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 112000,
      contractSizeUnit: 'lbs (Sugar No. 11)',
      minimumTickSize: 0.01,
      tickValue: 11.2,
      quotationUnit: 'cents/lb',
      tradingHoursTimezone: 'America/New_York',
      tradingHoursSummary: 'ICE Futures U.S.: 03:30-13:00 ET (pre-open 20:00 ET prior day)',
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.ice.com/products/23/Sugar-No-11-Futures',
    }),
    mxvMapping: {
      mxvSymbol: 'SBE',
      internationalSymbol: 'SB',
      internationalExchange: 'ICE',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Đường 11 ICE US" code SBE, linked exchange ICEUS, 112,000 lb, tick 0.01 cent/lb. Source: https://mxv.com.vn/hang-hoa/nguyen-lieu-cong-nghiep/duong-11.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'ICE:CC',
    productName: 'Cocoa',
    category: 'SOFT_COMMODITIES',
    exchange: 'ICE',
    exchangeSymbol: 'CC',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 10,
      contractSizeUnit: 'metric tons',
      minimumTickSize: 1,
      tickValue: 10,
      quotationUnit: 'USD/MT',
      tradingHoursTimezone: 'America/New_York',
      tradingHoursSummary: 'ICE Futures U.S.: 04:45-13:30 ET (pre-open 20:00 ET prior day)',
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.ice.com/products/7/Cocoa-Futures',
    }),
    mxvMapping: {
      mxvSymbol: 'CCE',
      internationalSymbol: 'CC',
      internationalExchange: 'ICE',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Cacao ICE US" code CCE, linked exchange ICEUS, 10 t, tick 1 USD/t. Source: https://mxv.com.vn/hang-hoa/nguyen-lieu-cong-nghiep/ca-cao.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'ICE:CT',
    productName: 'Cotton',
    category: 'SOFT_COMMODITIES',
    exchange: 'ICE',
    exchangeSymbol: 'CT',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 50000,
      contractSizeUnit: 'lbs net weight (Cotton No. 2)',
      minimumTickSize: 0.01,
      tickValue: 5,
      quotationUnit: 'cents/lb',
      tradingHoursTimezone: 'America/New_York',
      tradingHoursSummary: 'ICE Futures U.S.: 21:00-14:20 ET next day (pre-open 19:30 ET)',
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.ice.com/products/254/Cotton-No-2-Futures',
    }),
    mxvMapping: {
      mxvSymbol: 'CTE',
      internationalSymbol: 'CT',
      internationalExchange: 'ICE',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Bông Loại 2 ICE US" code CTE, linked exchange ICEUS, 50,000 lb, tick 0.01 cent/lb. Source: https://mxv.com.vn/hang-hoa/nguyen-lieu-cong-nghiep/bong.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },

  // METALS
  {
    id: 'COMEX:HG',
    productName: 'Copper',
    category: 'METALS',
    exchange: 'COMEX',
    exchangeSymbol: 'HG',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 25000,
      contractSizeUnit: 'lbs',
      minimumTickSize: 0.0005,
      tickValue: 12.5,
      quotationUnit: 'USD/lb',
      tradingHoursTimezone: 'America/New_York',
      tradingHoursSummary: CME_METALS_ENERGY_HOURS,
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/rulebook/COMEX/1a/111.pdf',
    }),
    mxvMapping: {
      mxvSymbol: 'CPE',
      internationalSymbol: 'HG',
      internationalExchange: 'COMEX',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Đồng COMEX" code CPE, linked exchange COMEX, 25,000 lb, tick 0.0005 USD/lb. Source: https://mxv.com.vn/hang-hoa/kim-loai/dong.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'COMEX:GC',
    productName: 'Gold',
    category: 'METALS',
    exchange: 'COMEX',
    exchangeSymbol: 'GC',
    contractMonth: null,
    contractYear: null,
    // Confirmed not listed: no gold product on MXV's metals list (mxv.com.vn/san-pham/kim-loai.html) as of 2026-11-17.
    isMvxListed: false,
    specification: verifiedSpec({
      contractSize: 100,
      contractSizeUnit: 'troy oz',
      minimumTickSize: 0.1,
      tickValue: 10,
      quotationUnit: 'USD/troy oz',
      tradingHoursTimezone: 'America/New_York',
      tradingHoursSummary: CME_METALS_ENERGY_HOURS,
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/trading/metals/files/fact-card-gold-futures-options.pdf',
    }),
    mxvMapping: null,
    enabled: true,
  },
  {
    id: 'COMEX:SI',
    productName: 'Silver',
    category: 'METALS',
    exchange: 'COMEX',
    exchangeSymbol: 'SI',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 5000,
      contractSizeUnit: 'troy oz',
      // Outright tick; spreads and settlement use 0.001 USD/oz.
      minimumTickSize: 0.005,
      tickValue: 25,
      quotationUnit: 'USD/troy oz',
      tradingHoursTimezone: 'America/New_York',
      tradingHoursSummary:
        'CME Globex: Sun-Fri 18:00-17:15 ET with a 45-minute break from 17:15 ET per CME silver fact card (other CME metals use a 60-minute break; confirm current schedule)',
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/rulebook/COMEX/1a/112.pdf',
    }),
    mxvMapping: {
      mxvSymbol: 'SIE',
      internationalSymbol: 'SI',
      internationalExchange: 'COMEX',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Bạc COMEX" code SIE, linked exchange COMEX, 5,000 troy oz, tick 0.005 USD/oz. Source: https://mxv.com.vn/hang-hoa/kim-loai/bac.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'NYMEX:PL',
    productName: 'Platinum',
    category: 'METALS',
    exchange: 'NYMEX',
    exchangeSymbol: 'PL',
    contractMonth: null,
    contractYear: null,
    isMvxListed: true,
    specification: verifiedSpec({
      contractSize: 50,
      contractSizeUnit: 'troy oz',
      minimumTickSize: 0.1,
      tickValue: 5,
      quotationUnit: 'USD/troy oz',
      tradingHoursTimezone: 'America/New_York',
      tradingHoursSummary: CME_METALS_ENERGY_HOURS,
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/rulebook/NYMEX/1a/105.pdf',
    }),
    mxvMapping: {
      mxvSymbol: 'PLE',
      internationalSymbol: 'PL',
      internationalExchange: 'NYMEX',
      mappingStatus: 'VERIFIED',
      notes: `MXV "Bạch kim NYMEX" code PLE, linked exchange NYMEX, 50 troy oz, tick 0.1 USD/oz. Source: https://mxv.com.vn/hang-hoa/kim-loai/bach-kim.html (checked ${CHECKED_ON}).`,
    },
    enabled: true,
  },
  {
    id: 'CME:TIO',
    productName: 'Iron Ore 62% Fe CFR China',
    category: 'METALS',
    exchange: 'CME',
    exchangeSymbol: 'TIO',
    contractMonth: null,
    contractYear: null,
    // MXV's iron ore product (FEF) is linked to SGX, not CME TIO, so CME TIO itself is not MXV-listed.
    isMvxListed: false,
    specification: verifiedSpec({
      contractSize: 500,
      contractSizeUnit: 'dry metric tons',
      minimumTickSize: 0.01,
      tickValue: 5,
      quotationUnit: 'USD/DMT',
      tradingHoursTimezone: 'America/Chicago',
      tradingHoursSummary: 'Trading hours not verified from an official CME page; check the CME Globex calendar',
      settlementMethod: 'CASH',
      dataSource: 'https://www.cmegroup.com/trading/metals/files/iron-ore-futures-faq.pdf',
    }),
    mxvMapping: {
      mxvSymbol: null,
      internationalSymbol: 'TIO',
      internationalExchange: 'CME',
      mappingStatus: 'UNAVAILABLE',
      notes: `Previous mapping FEF->CME TIO is wrong. MXV "Quặng sắt" code FEF is linked to SGX TSI Iron Ore CFR China (62% Fe Fines), 100 t/lot, tick 0.05 USD/t - not CME TIO (500 dmt). Source: https://en.mxv.com.vn/product/metals/iron-ore.html (checked ${CHECKED_ON}). SGX is not a supported ExchangeCode yet.`,
    },
    enabled: true,
  },

  // ENERGY
  {
    id: 'NYMEX:CL',
    productName: 'WTI Crude Oil',
    category: 'ENERGY',
    exchange: 'NYMEX',
    exchangeSymbol: 'CL',
    contractMonth: null,
    contractYear: null,
    // No energy products on MXV's current official product list (energies page returns 404).
    isMvxListed: false,
    specification: verifiedSpec({
      contractSize: 1000,
      contractSizeUnit: 'barrels',
      minimumTickSize: 0.01,
      tickValue: 10,
      quotationUnit: 'USD/barrel',
      tradingHoursTimezone: 'America/New_York',
      tradingHoursSummary: CME_METALS_ENERGY_HOURS,
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/rulebook/NYMEX/2/200.pdf',
    }),
    mxvMapping: {
      mxvSymbol: null,
      internationalSymbol: 'CL',
      internationalExchange: 'NYMEX',
      mappingStatus: 'UNAVAILABLE',
      notes: `Legacy unverified code "CLE" removed. MXV's current product menus (mxv.com.vn/san-pham.html and en.mxv.com.vn product pages) list no energy products and https://en.mxv.com.vn/product/energies.html returns 404 (checked ${CHECKED_ON}). ${MXV_PENDING}`,
    },
    enabled: true,
  },
  {
    id: 'ICE:BRN',
    productName: 'Brent Crude Oil',
    category: 'ENERGY',
    exchange: 'ICE',
    exchangeSymbol: 'BRN',
    contractMonth: null,
    contractYear: null,
    isMvxListed: false,
    specification: verifiedSpec({
      contractSize: 1000,
      contractSizeUnit: 'barrels',
      minimumTickSize: 0.01,
      tickValue: 10,
      quotationUnit: 'USD/barrel',
      tradingHoursTimezone: 'Europe/London',
      tradingHoursSummary:
        'ICE Futures Europe: 01:00-23:00 London; Sunday pre-open 22:00, open 23:00 London',
      // ICE: "deliverable contract based on EFP delivery with an option to cash settle against the ICE Brent Index".
      settlementMethod: 'CASH',
      dataSource: 'https://www.ice.com/products/219/Brent-Crude-Futures',
    }),
    mxvMapping: {
      mxvSymbol: null,
      internationalSymbol: 'BRN',
      internationalExchange: 'ICE',
      mappingStatus: 'UNAVAILABLE',
      notes: `Legacy unverified code "BKE" removed. No energy products on MXV's current official product lists; https://en.mxv.com.vn/product/energies.html returns 404 (checked ${CHECKED_ON}). ${MXV_PENDING}`,
    },
    enabled: true,
  },
  {
    id: 'NYMEX:NG',
    productName: 'Natural Gas',
    category: 'ENERGY',
    exchange: 'NYMEX',
    exchangeSymbol: 'NG',
    contractMonth: null,
    contractYear: null,
    isMvxListed: false,
    specification: verifiedSpec({
      contractSize: 10000,
      contractSizeUnit: 'MMBtu',
      minimumTickSize: 0.001,
      tickValue: 10,
      quotationUnit: 'USD/MMBtu',
      tradingHoursTimezone: 'America/New_York',
      tradingHoursSummary: CME_METALS_ENERGY_HOURS,
      settlementMethod: 'PHYSICAL',
      dataSource: 'https://www.cmegroup.com/rulebook/NYMEX/2/220.pdf',
    }),
    mxvMapping: {
      mxvSymbol: null,
      internationalSymbol: 'NG',
      internationalExchange: 'NYMEX',
      mappingStatus: 'UNAVAILABLE',
      notes: `Legacy unverified code "NGE" removed. No energy products on MXV's current official product lists; https://en.mxv.com.vn/product/energies.html returns 404 (checked ${CHECKED_ON}). ${MXV_PENDING}`,
    },
    enabled: true,
  },
];

export interface ContractCalendarRule {
  /** Official month codes (F G H J K M N Q U V X Z) or the exchange's listing rule. */
  listedMonths: string;
  lastTradingDayRule: string;
  sourceUrl: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED';
  notes?: string;
}

/**
 * Listed months and last-trading-day rules (text as published by the exchange).
 * Concrete per-month dates must be taken from the exchange expiry calendar, not computed from here
 * without a holiday calendar.
 */
export const CONTRACT_CALENDAR_RULES: Record<string, ContractCalendarRule> = {
  'CBOT:ZS': {
    listedMonths: 'F H K N Q U X (Jan, Mar, May, Jul, Aug, Sep, Nov)',
    lastTradingDayRule: 'Business day prior to the 15th calendar day of the contract month.',
    sourceUrl: 'https://www.cmegroup.com/rulebook/CBOT/II/11/11.pdf',
    verificationStatus: 'VERIFIED',
  },
  'CBOT:ZM': {
    listedMonths: 'F H K N Q U V Z (Jan, Mar, May, Jul, Aug, Sep, Oct, Dec)',
    lastTradingDayRule: 'Business day prior to the 15th calendar day of the contract month.',
    sourceUrl: 'https://www.cmegroup.com/rulebook/CBOT/II/13/13.pdf',
    verificationStatus: 'VERIFIED',
    notes:
      'Months from rulebook ch.13; LTD rule from CME Grain and Oilseed fact card and matches MXV ZME page.',
  },
  'CBOT:ZL': {
    listedMonths: 'F H K N Q U V Z (Jan, Mar, May, Jul, Aug, Sep, Oct, Dec)',
    lastTradingDayRule: 'Business day prior to the 15th calendar day of the contract month.',
    sourceUrl: 'https://www.cmegroup.com/rulebook/CBOT/II/12/12.pdf',
    verificationStatus: 'VERIFIED',
  },
  'CBOT:ZC': {
    listedMonths: 'H K N U Z (Mar, May, Jul, Sep, Dec)',
    lastTradingDayRule: 'Business day prior to the 15th calendar day of the contract month.',
    sourceUrl: 'https://www.cmegroup.com/rulebook/CBOT/I/10.pdf',
    verificationStatus: 'VERIFIED',
  },
  'CBOT:ZW': {
    listedMonths: 'H K N U Z (Mar, May, Jul, Sep, Dec)',
    lastTradingDayRule: 'Business day prior to the 15th calendar day of the contract month.',
    sourceUrl: 'https://www.cmegroup.com/rulebook/CBOT/II/14/14.pdf',
    verificationStatus: 'VERIFIED',
  },
  'CBOT:ZR': {
    listedMonths: 'F H K N U X (Jan, Mar, May, Jul, Sep, Nov)',
    lastTradingDayRule: 'Business day prior to the 15th calendar day of the contract month.',
    sourceUrl: 'https://www.cmegroup.com/rulebook/CBOT/II/17/17.pdf',
    verificationStatus: 'VERIFIED',
    notes:
      'Months per rulebook ch.17 and MXV ZRE page; one CME fact card also lists Aug (Q) - confirm against current CME listing.',
  },
  'ICE:KC': {
    listedMonths: 'H K N U Z (Mar, May, Jul, Sep, Dec)',
    lastTradingDayRule: 'One business day prior to last notice day (last notice day = seven business days prior to the last business day of the delivery month).',
    sourceUrl: 'https://www.ice.com/products/15/Coffee-C-Futures',
    verificationStatus: 'VERIFIED',
    notes: 'First notice day: seven business days prior to first business day of delivery month.',
  },
  'ICE:RC': {
    listedMonths: 'F H K N U X (Jan, Mar, May, Jul, Sep, Nov), ten delivery months available',
    lastTradingDayRule: 'Fourth business day preceding the last business day of the delivery month at 12:30 (London).',
    sourceUrl: 'https://www.ice.com/products/37089079/Robusta-Coffee-Futures',
    verificationStatus: 'VERIFIED',
    notes: 'First notice day: fourth business day preceding the first business day of the delivery month.',
  },
  'ICE:SB': {
    listedMonths: 'H K N V (Mar, May, Jul, Oct)',
    lastTradingDayRule: 'Last business day of the month preceding the delivery month.',
    sourceUrl: 'https://www.ice.com/products/23/Sugar-No-11-Futures',
    verificationStatus: 'VERIFIED',
  },
  'ICE:CC': {
    listedMonths: 'H K N U Z (Mar, May, Jul, Sep, Dec)',
    lastTradingDayRule: 'One business day prior to last notice day (last notice day = ten business days prior to last business day of delivery month).',
    sourceUrl: 'https://www.ice.com/products/7/Cocoa-Futures',
    verificationStatus: 'VERIFIED',
    notes: 'First notice day: ten business days prior to the sixth business day of delivery month.',
  },
  'ICE:CT': {
    listedMonths: 'H K N V Z (Mar, May, Jul, Oct, Dec)',
    lastTradingDayRule: 'Seventeen business days from end of spot month.',
    sourceUrl: 'https://www.ice.com/products/254/Cotton-No-2-Futures',
    verificationStatus: 'VERIFIED',
    notes: 'First notice day: five business days before the first delivery day of the spot month.',
  },
  'COMEX:HG': {
    listedMonths:
      'All months (F-Z) consecutively near-term, plus H K N U Z further out (out to 63 months)',
    lastTradingDayRule: 'Third last business day of the contract month.',
    sourceUrl: 'https://www.cmegroup.com/education/articles-and-reports/hedging-with-comex-copper-futures',
    verificationStatus: 'UNVERIFIED',
    notes:
      'CME education article says 24 consecutive months; MXV CPE page says 37 consecutive months. Number of consecutive months conflicts - confirm on CME contract-spec page. LTD rule matches MXV CPE page.',
  },
  'COMEX:GC': {
    listedMonths:
      'Current month and next two months; G J Q V within 23 months; M Z further out (approx. 72 months)',
    lastTradingDayRule: 'Third last business day of the delivery month.',
    sourceUrl: 'https://www.cmegroup.com/trading/metals/files/fact-card-gold-futures-options.pdf',
    verificationStatus: 'VERIFIED',
    notes: 'One passage of the fact card says "month preceding the delivery month" (applies to options); futures rule is delivery month.',
  },
  'COMEX:SI': {
    listedMonths:
      'Current month and next two months; F H K U within 23 months; N Z within 60 months',
    lastTradingDayRule: 'Third last business day of the delivery month.',
    sourceUrl: 'https://www.cmegroup.com/content/dam/cmegroup/rulebook/COMEX/1a/112.pdf',
    verificationStatus: 'VERIFIED',
    notes: 'Matches MXV SIE page LTD rule.',
  },
  'NYMEX:PL': {
    listedMonths:
      'Current month and next two months, then quarterly F J N V (Jan, Apr, Jul, Oct) within 15 months',
    lastTradingDayRule: 'Third last business day of the delivery month.',
    sourceUrl: 'https://www.cmegroup.com/trading/metals/files/metals-prod-guide-2023.pdf',
    verificationStatus: 'VERIFIED',
    notes: 'LTD per rulebook 105102.E; listing per 2023 CME metals product guide (older rulebook text differs slightly).',
  },
  'CME:TIO': {
    listedMonths: 'Monthly contracts (exact listing horizon not verified)',
    lastTradingDayRule:
      'Last business day of the contract month; if a Singapore public holiday, the preceding business day.',
    sourceUrl: 'https://www.cmegroup.com/trading/metals/files/iron-ore-future-and-options.pdf',
    verificationStatus: 'UNVERIFIED',
    notes: 'Cash settled against the monthly average of the index. Listing horizon not confirmed.',
  },
  'NYMEX:CL': {
    listedMonths: 'All months (F-Z) consecutively for the current year plus the next five years',
    lastTradingDayRule:
      'Trading terminates 3 business days before the 25th calendar day of the month prior to the contract month, adjusted when the 25th is a non-business day (see NYMEX rule 200102.F for the exact adjustment).',
    sourceUrl: 'https://www.cmegroup.com/trading/files/WTI-Fact-Card.pdf',
    verificationStatus: 'UNVERIFIED',
    notes:
      'Some CME text also mentions additional Jun/Dec months further out; confirm listing horizon. T24: downgraded - listing came only from a fact-card search snippet and QuantConnect Lean FuturesExpiryFunctions says "current year and the next 10 calendar years and 2 additional contract months". LTD rule agrees with Lean.',
  },
  'ICE:BRN': {
    listedMonths: 'All months (F-Z), up to 156 consecutive months',
    lastTradingDayRule:
      'Last business day of the second month preceding the contract month (e.g. March expires last business day of January); moved one business day earlier if that day precedes Christmas Day or New Year\'s Day.',
    sourceUrl: 'https://www.ice.com/products/219/Brent-Crude-Futures',
    verificationStatus: 'VERIFIED',
  },
  'NYMEX:NG': {
    listedMonths: 'Monthly contracts (exact listing horizon not verified)',
    lastTradingDayRule:
      'Third business day prior to the first calendar day of the delivery month; if the listed expiration day becomes a holiday, the business day immediately prior.',
    sourceUrl: 'https://www.cmegroup.com/notices/ser/2017/02/SER-7852.pdf',
    verificationStatus: 'UNVERIFIED',
    notes: 'LTD rule from a 2017 CME Special Executive Report reproducing Chapter 220; listing horizon not confirmed.',
  },
};
