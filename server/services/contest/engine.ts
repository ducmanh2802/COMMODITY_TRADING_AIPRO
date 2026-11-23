/**
 * T63 - contest engine: season handling, server-side fills, stop/target checks, scoring.
 * Fills use ONLY the latest server quote and the same fail-closed rules as paperMath/riskEngine:
 * quote must be CURRENT/DELAYED futures with a price, spec must be VERIFIED + USD. Past orders cannot be edited.
 * LEARNING ONLY: virtual money, no prizes, no buy/sell advice.
 */
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SETTINGS,
  accountSnapshot,
  balanceAfterClose,
  balanceAfterOpen,
  checkOrder,
  checkQuoteTradable,
  checkStops,
  computeClose,
  fillPrice,
  marginPerContractUsd,
  pnlUsd,
  validateSpec,
  type PaperSettings,
  type PaperSpec,
  type PositionLike,
  type PricedPosition,
  type QuoteLike,
  type Side,
  type ValidSpec,
} from '../../../src/components/views/papertrade/paperMath.ts';
import { anonymousName, combinedRanking, computeBadges, disciplineScore, maxDrawdownPct, publicTag, sanitizeDisplayName } from './scoring.ts';
import { ictDayKey, seasonIdOf, seasonRange } from './season.ts';
import type { ContestStore, OrderRow, ParticipantRow, PositionRow, ScoreRow } from './store.ts';

export const CONTEST_CAPITAL_VND = 500_000_000;
export const MAX_OPEN_POSITIONS = 20;
export const MAX_ORDERS_PER_DAY_HARD = 50;
export const MAX_CONTRACTS = 100;

export interface ContestQuote extends QuoteLike {
  source?: string;
  timestamp?: string | null;
}

export interface ContestDeps {
  store: ContestStore;
  getQuote: (instrumentId: string) => Promise<ContestQuote | null>;
  getSpec: (instrumentId: string) => PaperSpec | null | undefined;
  getFx: () => Promise<number | null>;
  now?: () => number;
  settings?: PaperSettings;
  capitalVnd?: number;
}

export class ContestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface OrderRequest {
  instrumentId: string;
  side: Side;
  contracts: number;
  stop?: number | null;
  target?: number | null;
  /** Pre-trade checklist completed? Optional (counts toward discipline when provided). */
  checklistDone?: boolean | null;
}

export class ContestEngine {
  private readonly store: ContestStore;
  private readonly now: () => number;
  private readonly settings: PaperSettings;
  private readonly capital: number;

  constructor(private readonly deps: ContestDeps) {
    this.store = deps.store;
    this.now = deps.now ?? Date.now;
    this.settings = deps.settings ?? DEFAULT_SETTINGS;
    this.capital = deps.capitalVnd ?? CONTEST_CAPITAL_VND;
  }

  currentSeason(): string {
    return seasonIdOf(this.now());
  }

  seasonInfo() {
    const id = this.currentSeason();
    const r = seasonRange(id);
    return {
      season: id,
      startsAt: new Date(r.startMs).toISOString(),
      endsAt: new Date(r.endMs).toISOString(),
      capitalVnd: this.capital,
      timezone: 'Asia/Ho_Chi_Minh',
      feePerContractUsd: this.settings.feePerContractUsd,
      slippageTicks: this.settings.slippageTicks,
    };
  }

  join(uid: string, displayName?: unknown): ParticipantRow {
    const season = this.currentSeason();
    const existing = this.store.getParticipant(season, uid);
    if (existing) return existing;
    const p: ParticipantRow = {
      season,
      uid,
      tag: publicTag(season, uid),
      displayName: sanitizeDisplayName(displayName),
      capitalVnd: this.capital,
      balanceVnd: this.capital,
      joinedAt: this.now(),
    };
    this.store.addParticipant(p);
    return this.store.getParticipant(season, uid) as ParticipantRow;
  }

  private requireParticipant(uid: string): ParticipantRow {
    const p = this.store.getParticipant(this.currentSeason(), uid);
    if (!p) throw new ContestError('NOT_JOINED', 403, 'Join the current season first.');
    return p;
  }

  private specFor(instrumentId: string): ValidSpec {
    const res = validateSpec(this.deps.getSpec(instrumentId));
    if (!res.ok) throw new ContestError(`SPEC_${res.reason}`, 422, `Contract specification rejected: ${res.reason}.`);
    return res.spec;
  }

  private async tradableQuote(instrumentId: string): Promise<{ price: number; source: string; timestamp: string | null }> {
    let q: ContestQuote | null = null;
    try {
      q = await this.deps.getQuote(instrumentId);
    } catch {
      q = null;
    }
    const gate = checkQuoteTradable(q);
    if (!gate.ok) throw new ContestError(`QUOTE_${gate.reason}`, 422, `No tradable quote: ${gate.reason}.`);
    return { price: gate.price, source: q?.source ?? 'UNKNOWN', timestamp: q?.timestamp ?? null };
  }

  private toPositionLike(p: PositionRow): PositionLike {
    return {
      id: p.id,
      instrumentId: p.instrumentId,
      side: p.side,
      contracts: p.contracts,
      entryPrice: p.entryPrice,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      marginPerContractUsd: p.marginPerContractUsd,
      entryFeeVnd: p.entryFeeVnd,
    };
  }

  async placeOrder(uid: string, req: OrderRequest): Promise<{ order: OrderRow; position: PositionRow }> {
    const season = this.currentSeason();
    this.requireParticipant(uid);
    if (!Number.isInteger(req.contracts) || req.contracts < 1 || req.contracts > MAX_CONTRACTS) {
      throw new ContestError('BAD_QTY', 422, `Contracts must be an integer from 1 to ${MAX_CONTRACTS}.`);
    }
    if (req.stop === null || req.stop === undefined || !Number.isFinite(req.stop) || req.stop <= 0) {
      throw new ContestError('STOP_REQUIRED', 422, 'A stop-loss is required on every contest order.');
    }
    if (req.target !== null && req.target !== undefined && (!Number.isFinite(req.target) || req.target <= 0)) {
      throw new ContestError('BAD_TP', 422, 'Invalid target price.');
    }
    const spec = this.specFor(req.instrumentId);
    const quote = await this.tradableQuote(req.instrumentId);
    const fx = await this.deps.getFx().catch(() => null);
    if (fx === null || !Number.isFinite(fx) || fx <= 0) throw new ContestError('FX_UNAVAILABLE', 422, 'USD/VND rate unavailable.');

    // Everything below is synchronous (no await until the writes): balance, open positions and the daily
    // count are read AFTER the async quote/FX calls, so a concurrent double submit or the stop job cannot
    // act on a stale snapshot (limit bypass / lost balance update).
    if (season !== this.currentSeason()) throw new ContestError('SEASON_CHANGED', 409, 'Season changed; retry.');
    const participant = this.requireParticipant(uid);
    const nowMs = this.now();
    const dayStart = seasonRangeDayStart(nowMs);
    if (this.store.countOrdersSince(season, uid, dayStart) >= MAX_ORDERS_PER_DAY_HARD) {
      throw new ContestError('TOO_MANY_ORDERS', 429, 'Daily order limit reached.');
    }
    const open = this.store.positions(season, uid).filter((p) => p.status === 'OPEN');
    if (open.length >= MAX_OPEN_POSITIONS) throw new ContestError('TOO_MANY_POSITIONS', 422, 'Too many open positions.');

    const fill = fillPrice(spec, req.side, quote.price, this.settings.slippageTicks, true);
    const priced: PricedPosition[] = [];
    for (const p of open) {
      const s = validateSpec(this.deps.getSpec(p.instrumentId));
      if (s.ok) priced.push({ pos: this.toPositionLike(p), spec: s.spec, price: p.lastMark });
    }
    const snap = accountSnapshot(participant.balanceVnd, priced, fx, this.settings);
    const chk = checkOrder(spec, { side: req.side, contracts: req.contracts, fill, stopLoss: req.stop, takeProfit: req.target ?? null }, snap, fx, this.settings);
    if (!chk.ok) throw new ContestError(chk.reason, 422, `Order rejected: ${chk.reason}.`);

    const riskPct = chk.riskVnd === null ? null : (chk.riskVnd / participant.capitalVnd) * 100;
    const positionId = randomUUID();
    const position: PositionRow = {
      id: positionId,
      season,
      uid,
      instrumentId: req.instrumentId,
      side: req.side,
      contracts: req.contracts,
      entryPrice: fill,
      stopLoss: req.stop,
      takeProfit: req.target ?? null,
      marginPerContractUsd: marginPerContractUsd(spec, fill, this.settings.marginPct),
      entryFeeVnd: chk.feeVnd,
      fxOpen: fx,
      status: 'OPEN',
      lastMark: quote.price,
      lastMarkAt: nowMs,
      exitPrice: null,
      closeReason: null,
      pnlVnd: null,
      rMultiple: null,
      openedAt: nowMs,
      closedAt: null,
    };
    const order: OrderRow = {
      id: randomUUID(),
      season,
      uid,
      positionId,
      instrumentId: req.instrumentId,
      side: req.side,
      contracts: req.contracts,
      fillPrice: fill,
      stopLoss: req.stop,
      takeProfit: req.target ?? null,
      quoteSource: quote.source,
      quoteTs: quote.timestamp,
      feeVnd: chk.feeVnd,
      riskVnd: chk.riskVnd,
      riskPct,
      checklistDone: typeof req.checklistDone === 'boolean' ? req.checklistDone : null,
      createdAt: nowMs,
    };
    this.store.transaction(() => {
      this.store.insertPosition(position);
      this.store.insertOrder(order);
      this.store.setBalance(season, uid, balanceAfterOpen(participant.balanceVnd, chk.feeVnd));
    });
    this.recompute(season);
    return { order, position };
  }

  private settle(pos: PositionRow, reason: string, spec: ValidSpec, price: number): void {
    const exit = fillPrice(spec, pos.side, price, this.settings.slippageTicks, false);
    const calc = computeClose(spec, this.toPositionLike(pos), exit, pos.fxOpen, this.settings);
    const part = this.store.getParticipant(pos.season, pos.uid);
    this.store.transaction(() => {
      if (!this.store.closePosition(pos.id, { exitPrice: exit, reason, pnlVnd: calc.pnlVnd, rMultiple: calc.rMultiple, at: this.now() })) return;
      if (part) this.store.setBalance(pos.season, pos.uid, balanceAfterClose(part.balanceVnd, this.toPositionLike(pos), calc));
    });
  }

  async closePosition(uid: string, positionId: string): Promise<PositionRow> {
    const pos = this.store.getPosition(positionId);
    if (!pos || pos.uid !== uid) throw new ContestError('NOT_FOUND', 404, 'Position not found.');
    if (pos.status !== 'OPEN') throw new ContestError('ALREADY_CLOSED', 409, 'Position already closed.');
    const spec = this.specFor(pos.instrumentId);
    const quote = await this.tradableQuote(pos.instrumentId);
    this.settle(pos, 'MANUAL', spec, quote.price);
    this.recompute(pos.season);
    return this.store.getPosition(positionId) as PositionRow;
  }

  /** Scheduler job: refresh marks and close positions whose stop/target was hit on the latest quote. */
  async runStopCheck(): Promise<{ checked: number; closed: number }> {
    const cur = this.currentSeason();
    const seasons = [...new Set([...this.store.openSeasons(), cur])].sort();
    let checked = 0;
    let closed = 0;
    const touched = new Set<string>();
    const quotes = new Map<string, Awaited<ReturnType<ContestEngine['tradableQuote']>> | null>();
    for (const season of seasons) {
      for (const pos of this.store.openPositions(season)) {
        checked++;
        if (!quotes.has(pos.instrumentId)) quotes.set(pos.instrumentId, await this.tradableQuote(pos.instrumentId).catch(() => null));
        const q = quotes.get(pos.instrumentId);
        const spec = validateSpec(this.deps.getSpec(pos.instrumentId));
        if (!q || !spec.ok) continue; // fail closed: no mark, no fill
        this.store.setMark(pos.id, q.price, this.now());
        touched.add(season);
        const hit = checkStops(this.toPositionLike(pos), q.price);
        if (hit) {
          this.settle(pos, hit, spec.spec, q.price);
          closed++;
        }
      }
    }
    for (const s of touched) this.recompute(s);
    return { checked, closed };
  }

  private equityOf(p: ParticipantRow, positions: PositionRow[]): { equity: number; series: number[]; closedTrades: number } {
    let eq = p.capitalVnd;
    const series = [eq];
    const closed = positions.filter((x) => x.status === 'CLOSED').sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
    for (const c of closed) {
      eq += c.pnlVnd ?? 0;
      series.push(eq);
    }
    let live = eq;
    for (const o of positions.filter((x) => x.status === 'OPEN')) {
      const s = validateSpec(this.deps.getSpec(o.instrumentId));
      live -= o.entryFeeVnd;
      if (s.ok && o.lastMark !== null) live += pnlUsd(s.spec, o.side, o.entryPrice, o.lastMark, o.contracts) * o.fxOpen;
    }
    series.push(live);
    return { equity: live, series, closedTrades: closed.length };
  }

  /** Recomputes returns, discipline, combined ranking and badges for a season and stores them. */
  recompute(season: string): ScoreRow[] {
    const nowMs = this.now();
    const rows: Omit<ScoreRow, 'rank' | 'combined'>[] = [];
    for (const p of this.store.listParticipants(season)) {
      const orders = this.store.orders(season, p.uid);
      if (orders.length === 0) continue;
      const { equity, series, closedTrades } = this.equityOf(p, this.store.positions(season, p.uid));
      const dd = maxDrawdownPct(series);
      const d = disciplineScore(
        orders.map((o) => ({ hasStop: o.stopLoss !== null, riskPct: o.riskPct, createdAtMs: o.createdAt, checklistDone: o.checklistDone })),
        dd,
      );
      const returnPct = ((equity - p.capitalVnd) / p.capitalVnd) * 100;
      const discipline = d?.score ?? 0;
      rows.push({
        season,
        uid: p.uid,
        tag: p.tag,
        name: p.displayName ?? anonymousName(p.tag),
        returnPct,
        discipline,
        equityVnd: equity,
        maxDdPct: dd,
        orders: orders.length,
        closedTrades,
        badges: computeBadges({ orders: orders.length, closedTrades, discipline, maxDdPct: dd, returnPct }),
        updatedAt: nowMs,
      });
    }
    const ranked = combinedRanking(rows.map((r) => ({ id: r.uid, returnPct: r.returnPct, discipline: r.discipline })));
    const byUid = new Map(rows.map((r) => [r.uid, r]));
    const out: ScoreRow[] = ranked.map((r) => ({ ...(byUid.get(r.id) as Omit<ScoreRow, 'rank' | 'combined'>), combined: r.combined, rank: r.rank }));
    this.store.replaceScores(season, out);
    return out;
  }

  /** Public leaderboard: anonymised (no uid). */
  leaderboard(season: string = this.currentSeason(), meUid?: string) {
    return this.store.scores(season).map((s) => ({
      rank: s.rank,
      tag: s.tag,
      name: s.name,
      returnPct: round2(s.returnPct),
      discipline: s.discipline,
      combined: s.combined,
      maxDdPct: round2(s.maxDdPct),
      orders: s.orders,
      closedTrades: s.closedTrades,
      badges: s.badges,
      isMe: meUid !== undefined && s.uid === meUid,
    }));
  }

  me(uid: string) {
    const season = this.currentSeason();
    const participant = this.store.getParticipant(season, uid);
    if (!participant) return { season, joined: false as const };
    const positions = this.store.positions(season, uid);
    const score = this.store.scores(season).find((s) => s.uid === uid) ?? null;
    const { equity } = this.equityOf(participant, positions);
    return {
      season,
      joined: true as const,
      tag: participant.tag,
      name: participant.displayName ?? anonymousName(participant.tag),
      capitalVnd: participant.capitalVnd,
      balanceVnd: participant.balanceVnd,
      equityVnd: equity,
      returnPct: round2(((equity - participant.capitalVnd) / participant.capitalVnd) * 100),
      score: score && { rank: score.rank, discipline: score.discipline, combined: score.combined, badges: score.badges, maxDdPct: round2(score.maxDdPct) },
      positions: positions.map(({ uid: _u, ...rest }) => rest),
      orders: this.store.orders(season, uid).slice(-50).map(({ uid: _u, ...rest }) => rest),
    };
  }
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** 00:00 ICT of the day containing `ms`. */
function seasonRangeDayStart(ms: number): number {
  const key = ictDayKey(ms);
  return Date.parse(`${key}T00:00:00+07:00`);
}
