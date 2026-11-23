/** T63 - SQLite storage for the paper-trading contest (market DB). Server is the source of truth. */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface ParticipantRow {
  season: string;
  uid: string;
  tag: string;
  displayName: string | null;
  capitalVnd: number;
  balanceVnd: number;
  joinedAt: number;
}
export interface OrderRow {
  id: string;
  season: string;
  uid: string;
  positionId: string;
  instrumentId: string;
  side: 'LONG' | 'SHORT';
  contracts: number;
  fillPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  quoteSource: string;
  quoteTs: string | null;
  feeVnd: number;
  riskVnd: number | null;
  riskPct: number | null;
  checklistDone: boolean | null;
  createdAt: number;
}
export interface PositionRow {
  id: string;
  season: string;
  uid: string;
  instrumentId: string;
  side: 'LONG' | 'SHORT';
  contracts: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  marginPerContractUsd: number;
  entryFeeVnd: number;
  fxOpen: number;
  status: 'OPEN' | 'CLOSED';
  lastMark: number | null;
  lastMarkAt: number | null;
  exitPrice: number | null;
  closeReason: string | null;
  pnlVnd: number | null;
  rMultiple: number | null;
  openedAt: number;
  closedAt: number | null;
}
export interface ScoreRow {
  season: string;
  tag: string;
  uid: string;
  name: string;
  returnPct: number;
  discipline: number;
  combined: number;
  rank: number;
  equityVnd: number;
  maxDdPct: number;
  orders: number;
  closedTrades: number;
  badges: string[];
  updatedAt: number;
}

type Row = Record<string, unknown>;

export class ContestStore {
  private readonly db: DatabaseSync;
  constructor(location: string = process.env.MARKET_DB_PATH?.trim() || path.join('data', 'market.db')) {
    if (location !== ':memory:') mkdirSync(path.dirname(path.resolve(location)), { recursive: true });
    this.db = new DatabaseSync(location);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contest_participants (
        season TEXT NOT NULL, uid TEXT NOT NULL, tag TEXT NOT NULL, display_name TEXT,
        capital_vnd REAL NOT NULL, balance_vnd REAL NOT NULL, joined_at INTEGER NOT NULL,
        PRIMARY KEY (season, uid)
      );
      CREATE TABLE IF NOT EXISTS contest_orders (
        id TEXT PRIMARY KEY, season TEXT NOT NULL, uid TEXT NOT NULL, position_id TEXT NOT NULL,
        instrument_id TEXT NOT NULL, side TEXT NOT NULL, contracts INTEGER NOT NULL, fill_price REAL NOT NULL,
        stop_loss REAL, take_profit REAL, quote_source TEXT NOT NULL, quote_ts TEXT, fee_vnd REAL NOT NULL,
        risk_vnd REAL, risk_pct REAL, checklist_done INTEGER, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contest_orders_user ON contest_orders (season, uid, created_at);
      CREATE TABLE IF NOT EXISTS contest_positions (
        id TEXT PRIMARY KEY, season TEXT NOT NULL, uid TEXT NOT NULL, instrument_id TEXT NOT NULL, side TEXT NOT NULL,
        contracts INTEGER NOT NULL, entry_price REAL NOT NULL, stop_loss REAL, take_profit REAL,
        margin_per_contract_usd REAL NOT NULL, entry_fee_vnd REAL NOT NULL, fx_open REAL NOT NULL,
        status TEXT NOT NULL, last_mark REAL, last_mark_at INTEGER, exit_price REAL, close_reason TEXT,
        pnl_vnd REAL, r_multiple REAL, opened_at INTEGER NOT NULL, closed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_contest_positions_user ON contest_positions (season, uid, status);
      CREATE TABLE IF NOT EXISTS contest_scores (
        season TEXT NOT NULL, uid TEXT NOT NULL, tag TEXT NOT NULL, name TEXT NOT NULL, return_pct REAL NOT NULL,
        discipline REAL NOT NULL, combined REAL NOT NULL, rank INTEGER NOT NULL, equity_vnd REAL NOT NULL,
        max_dd_pct REAL NOT NULL, orders INTEGER NOT NULL, closed_trades INTEGER NOT NULL, badges TEXT NOT NULL,
        updated_at INTEGER NOT NULL, PRIMARY KEY (season, uid)
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ---- participants
  addParticipant(p: ParticipantRow): boolean {
    const r = this.db
      .prepare('INSERT OR IGNORE INTO contest_participants (season, uid, tag, display_name, capital_vnd, balance_vnd, joined_at) VALUES (?,?,?,?,?,?,?)')
      .run(p.season, p.uid, p.tag, p.displayName, p.capitalVnd, p.balanceVnd, p.joinedAt);
    return Number(r.changes) > 0;
  }
  getParticipant(season: string, uid: string): ParticipantRow | null {
    const r = this.db.prepare('SELECT * FROM contest_participants WHERE season = ? AND uid = ?').get(season, uid) as Row | undefined;
    return r ? mapParticipant(r) : null;
  }
  listParticipants(season: string): ParticipantRow[] {
    return (this.db.prepare('SELECT * FROM contest_participants WHERE season = ?').all(season) as Row[]).map(mapParticipant);
  }
  setBalance(season: string, uid: string, balanceVnd: number): void {
    this.db.prepare('UPDATE contest_participants SET balance_vnd = ? WHERE season = ? AND uid = ?').run(balanceVnd, season, uid);
  }

  // ---- orders / positions
  insertOrder(o: OrderRow): void {
    this.db
      .prepare(
        `INSERT INTO contest_orders (id, season, uid, position_id, instrument_id, side, contracts, fill_price, stop_loss, take_profit,
         quote_source, quote_ts, fee_vnd, risk_vnd, risk_pct, checklist_done, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(o.id, o.season, o.uid, o.positionId, o.instrumentId, o.side, o.contracts, o.fillPrice, o.stopLoss, o.takeProfit, o.quoteSource,
        o.quoteTs, o.feeVnd, o.riskVnd, o.riskPct, o.checklistDone === null ? null : o.checklistDone ? 1 : 0, o.createdAt);
  }
  insertPosition(p: PositionRow): void {
    this.db
      .prepare(
        `INSERT INTO contest_positions (id, season, uid, instrument_id, side, contracts, entry_price, stop_loss, take_profit,
         margin_per_contract_usd, entry_fee_vnd, fx_open, status, last_mark, last_mark_at, exit_price, close_reason, pnl_vnd, r_multiple,
         opened_at, closed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(p.id, p.season, p.uid, p.instrumentId, p.side, p.contracts, p.entryPrice, p.stopLoss, p.takeProfit, p.marginPerContractUsd,
        p.entryFeeVnd, p.fxOpen, p.status, p.lastMark, p.lastMarkAt, p.exitPrice, p.closeReason, p.pnlVnd, p.rMultiple, p.openedAt, p.closedAt);
  }
  closePosition(id: string, c: { exitPrice: number; reason: string; pnlVnd: number; rMultiple: number | null; at: number }): boolean {
    const r = this.db
      .prepare(
        "UPDATE contest_positions SET status = 'CLOSED', exit_price = ?, close_reason = ?, pnl_vnd = ?, r_multiple = ?, closed_at = ?, last_mark = ?, last_mark_at = ? WHERE id = ? AND status = 'OPEN'",
      )
      .run(c.exitPrice, c.reason, c.pnlVnd, c.rMultiple, c.at, c.exitPrice, c.at, id);
    return Number(r.changes) > 0;
  }
  setMark(id: string, price: number, at: number): void {
    this.db.prepare("UPDATE contest_positions SET last_mark = ?, last_mark_at = ? WHERE id = ? AND status = 'OPEN'").run(price, at, id);
  }
  getPosition(id: string): PositionRow | null {
    const r = this.db.prepare('SELECT * FROM contest_positions WHERE id = ?').get(id) as Row | undefined;
    return r ? mapPosition(r) : null;
  }
  positions(season: string, uid?: string): PositionRow[] {
    const rows = uid
      ? this.db.prepare('SELECT * FROM contest_positions WHERE season = ? AND uid = ? ORDER BY opened_at').all(season, uid)
      : this.db.prepare('SELECT * FROM contest_positions WHERE season = ? ORDER BY opened_at').all(season);
    return (rows as Row[]).map(mapPosition);
  }
  /** Seasons that still have open positions (so old seasons are never orphaned). */
  openSeasons(): string[] {
    return (this.db.prepare("SELECT DISTINCT season FROM contest_positions WHERE status = 'OPEN'").all() as Array<{ season: string }>).map((r) => r.season);
  }
  openPositions(season: string): PositionRow[] {
    return (this.db.prepare("SELECT * FROM contest_positions WHERE season = ? AND status = 'OPEN' ORDER BY opened_at").all(season) as Row[]).map(mapPosition);
  }
  orders(season: string, uid?: string): OrderRow[] {
    const rows = uid
      ? this.db.prepare('SELECT * FROM contest_orders WHERE season = ? AND uid = ? ORDER BY created_at').all(season, uid)
      : this.db.prepare('SELECT * FROM contest_orders WHERE season = ? ORDER BY created_at').all(season);
    return (rows as Row[]).map(mapOrder);
  }
  countOrdersSince(season: string, uid: string, sinceMs: number): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM contest_orders WHERE season = ? AND uid = ? AND created_at >= ?').get(season, uid, sinceMs) as { n: number }).n;
  }

  // ---- scores
  replaceScores(season: string, rows: ScoreRow[]): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM contest_scores WHERE season = ?').run(season);
      const ins = this.db.prepare(
        'INSERT INTO contest_scores (season, uid, tag, name, return_pct, discipline, combined, rank, equity_vnd, max_dd_pct, orders, closed_trades, badges, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      );
      for (const s of rows) {
        ins.run(s.season, s.uid, s.tag, s.name, s.returnPct, s.discipline, s.combined, s.rank, s.equityVnd, s.maxDdPct, s.orders, s.closedTrades, JSON.stringify(s.badges), s.updatedAt);
      }
    });
  }
  scores(season: string): ScoreRow[] {
    return (this.db.prepare('SELECT * FROM contest_scores WHERE season = ? ORDER BY rank').all(season) as Row[]).map((r) => ({
      season: String(r.season),
      uid: String(r.uid),
      tag: String(r.tag),
      name: String(r.name),
      returnPct: Number(r.return_pct),
      discipline: Number(r.discipline),
      combined: Number(r.combined),
      rank: Number(r.rank),
      equityVnd: Number(r.equity_vnd),
      maxDdPct: Number(r.max_dd_pct),
      orders: Number(r.orders),
      closedTrades: Number(r.closed_trades),
      badges: JSON.parse(String(r.badges)) as string[],
      updatedAt: Number(r.updated_at),
    }));
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function mapParticipant(r: Row): ParticipantRow {
  return {
    season: String(r.season),
    uid: String(r.uid),
    tag: String(r.tag),
    displayName: r.display_name === null ? null : String(r.display_name),
    capitalVnd: Number(r.capital_vnd),
    balanceVnd: Number(r.balance_vnd),
    joinedAt: Number(r.joined_at),
  };
}
function mapPosition(r: Row): PositionRow {
  return {
    id: String(r.id),
    season: String(r.season),
    uid: String(r.uid),
    instrumentId: String(r.instrument_id),
    side: r.side as 'LONG' | 'SHORT',
    contracts: Number(r.contracts),
    entryPrice: Number(r.entry_price),
    stopLoss: num(r.stop_loss),
    takeProfit: num(r.take_profit),
    marginPerContractUsd: Number(r.margin_per_contract_usd),
    entryFeeVnd: Number(r.entry_fee_vnd),
    fxOpen: Number(r.fx_open),
    status: r.status as 'OPEN' | 'CLOSED',
    lastMark: num(r.last_mark),
    lastMarkAt: num(r.last_mark_at),
    exitPrice: num(r.exit_price),
    closeReason: r.close_reason === null ? null : String(r.close_reason),
    pnlVnd: num(r.pnl_vnd),
    rMultiple: num(r.r_multiple),
    openedAt: Number(r.opened_at),
    closedAt: num(r.closed_at),
  };
}
function mapOrder(r: Row): OrderRow {
  return {
    id: String(r.id),
    season: String(r.season),
    uid: String(r.uid),
    positionId: String(r.position_id),
    instrumentId: String(r.instrument_id),
    side: r.side as 'LONG' | 'SHORT',
    contracts: Number(r.contracts),
    fillPrice: Number(r.fill_price),
    stopLoss: num(r.stop_loss),
    takeProfit: num(r.take_profit),
    quoteSource: String(r.quote_source),
    quoteTs: r.quote_ts === null ? null : String(r.quote_ts),
    feeVnd: Number(r.fee_vnd),
    riskVnd: num(r.risk_vnd),
    riskPct: num(r.risk_pct),
    checklistDone: r.checklist_done === null ? null : Number(r.checklist_done) === 1,
    createdAt: Number(r.created_at),
  };
}
