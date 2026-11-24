import type { AppModuleId } from '../../../../shared/types/risk';
import type { DiagramId } from '../diagrams/ids';

export interface Source {
  label: string;
  url: string;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  /** Index of the correct option. */
  answer: number;
  why: string;
}

export type CalculatorId = 'tick-pnl' | 'margin-leverage' | 'position-sizing' | 'roll-cost' | 'margin-call' | 'curve-quiz' | 'fx-convert' | 'order';

/** A worked example whose numbers are computed at render time with learnMath from the verified instrument spec. */
export type ExampleCalc =
  | { kind: 'tickPnl'; instrumentId: string; priceMove: number; contracts: number }
  | { kind: 'leverage'; instrumentId: string; price: number; marginUsd: number; movePct: number }
  | { kind: 'roll'; instrumentId: string; near: number; far: number; contracts: number }
  | { kind: 'sizing'; instrumentId: string; equity: number; riskPct: number; stop: number; costs: number }
  | { kind: 'marginCall'; instrumentId: string; initial: number; maintenance: number; contracts: number }
  | { kind: 'swing'; instrumentId: string; entry: number; atr: number; atrMult: number; equity: number; riskPct: number; costs: number; exit: number };

export interface Lesson {
  id: string;
  title: string;
  /** Mục tiêu. */
  objective: string;
  /** Short plain-Vietnamese paragraphs. */
  body: string[];
  example?: { caption: string; calc: ExampleCalc };
  /** Free-text illustrative example (no spec numbers). */
  textExample?: string;
  /** Extra worked scenarios shown as titled cards. */
  examples?: { title: string; text: string }[];
  /** "Ghi nhớ" box. */
  remember: string[];
  quiz: QuizQuestion[];
  links?: { module: AppModuleId; label: string }[];
  sources: Source[];
  /** Instrument ids whose verified specs are displayed from the app's instrument master. */
  instrumentIds?: string[];
  calculator?: CalculatorId;
  /** Interactive research checklist (progress saved in localStorage). */
  checklist?: { text: string; module?: AppModuleId; moduleLabel?: string }[];
  /** Statements that must be re-verified with MXV / the broker. */
  uncertain?: string[];
  /** Curated videos from reputable sources (verified to exist). */
  videos?: LessonVideo[];
  /** Extra inline figures (keys of diagrams/group{A,B,C,D}.tsx), shown after the body in order. */
  figures?: string[];
  /**
   * Optional placement: figure id → body paragraph index after which it renders inline.
   * Figures not listed here keep the default position after the body.
   */
  figureAt?: Record<string, number>;
  /** Inline SVG diagram shown after the body. */
  diagram?: DiagramId;
}

export interface Level {
  id: string;
  number: number;
  title: string;
  goal: string;
  lessons: Lesson[];
}

/**
 * Quiz helper. Authors list the correct option anywhere (usually first); the options are then shuffled
 * deterministically (seeded by the question text) so the right answer is not always in the same place,
 * yet stays stable between renders and sessions.
 */
export const q = (question: string, options: string[], answer: number, why: string): QuizQuestion => {
  let h = 2166136261;
  for (let i = 0; i < question.length; i++) h = Math.imul(h ^ question.charCodeAt(i), 16777619) >>> 0;
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { q: question, options: order.map((i) => options[i]), answer: order.indexOf(answer), why };
};

export const SRC = {
  cmeEdu: { label: 'CME Group – Education', url: 'https://www.cmegroup.com/education.html' },
  cmeAg: { label: 'CME Group – Nông sản', url: 'https://www.cmegroup.com/markets/agriculture.html' },
  cmeEnergy: { label: 'CME Group – Năng lượng', url: 'https://www.cmegroup.com/markets/energy.html' },
  cmeMetals: { label: 'CME Group – Kim loại', url: 'https://www.cmegroup.com/markets/metals.html' },
  ice: { label: 'ICE (theice.com)', url: 'https://www.theice.com' },
  mxv: { label: 'MXV – mxv.com.vn', url: 'https://mxv.com.vn' },
  mxvOverview: { label: 'MXV – tổng quan', url: 'https://en.mxv.com.vn/overview.html' },
  mxvMargin: { label: 'MXV – bảng ký quỹ', url: 'https://en.mxv.com.vn/trading/margin.html' },
  finhay: { label: 'Quy định giao dịch HHPS (thành viên Finhay)', url: 'https://www.finhay.com.vn/quy-dinh-giao-dich-hang-hoa-phai-sinh' },
  cftc: { label: 'CFTC – Commitments of Traders', url: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm' },
  wasde: { label: 'USDA – WASDE', url: 'https://www.usda.gov/oce/commodity/wasde' },
  usda: { label: 'USDA', url: 'https://www.usda.gov' },
  eia: { label: 'EIA – Weekly Petroleum Status Report', url: 'https://www.eia.gov/petroleum/supply/weekly/' },
  eiaGas: { label: 'EIA – Natural Gas Weekly Update', url: 'https://www.eia.gov/naturalgas/weekly/' },
} satisfies Record<string, Source>;

export interface LessonVideo {
  title: string;
  url: string;
  /** Publisher, e.g. "CME Group", "CFTC", "MXV". */
  source: string;
  lang: 'vi' | 'en';
  duration?: string;
  /** One line on what to watch for. */
  note?: string;
}
