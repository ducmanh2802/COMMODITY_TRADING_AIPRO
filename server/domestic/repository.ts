/**
 * SQLite storage for Vietnam domestic price points (own table `domestic_prices`, shared market DB).
 * Never touches PRAGMA user_version (owned by the candle repository).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DomesticCommodity, DomesticPricePoint } from '../../src/shared/domestic/basis.ts';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS domestic_prices (
  commodity  TEXT NOT NULL,
  region     TEXT NOT NULL,
  date       TEXT NOT NULL,
  source     TEXT NOT NULL,
  price      REAL NOT NULL,
  unit       TEXT NOT NULL,
  currency   TEXT NOT NULL,
  source_url TEXT NOT NULL,
  quality    TEXT NOT NULL CHECK (quality IN ('OFFICIAL','UNOFFICIAL','MANUAL')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (commodity, region, date, source)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS domestic_prices_cd ON domestic_prices (commodity, date);
`;

export interface DomesticRepositoryLike {
  upsert(points: DomesticPricePoint[]): { inserted: number; updated: number };
  latest(commodity: DomesticCommodity): DomesticPricePoint | null;
  history(commodity: DomesticCommodity, region: string, sinceDate: string): DomesticPricePoint[];
}

interface Row {
  commodity: DomesticCommodity;
  region: string;
  date: string;
  source: string;
  price: number;
  unit: string;
  currency: 'VND' | 'USD';
  source_url: string;
  quality: DomesticPricePoint['quality'];
}

const toPoint = (r: Row): DomesticPricePoint => ({
  commodity: r.commodity,
  region: r.region,
  date: r.date,
  source: r.source,
  price: r.price,
  unit: r.unit,
  currency: r.currency,
  sourceUrl: r.source_url,
  quality: r.quality,
});

export class SqliteDomesticRepository implements DomesticRepositoryLike {
  private readonly db: DatabaseSync;

  constructor(location: string = process.env.MARKET_DB_PATH?.trim() || path.join('data', 'market.db')) {
    if (location !== ':memory:') mkdirSync(path.dirname(path.resolve(location)), { recursive: true });
    this.db = new DatabaseSync(location);
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(SCHEMA_SQL);
  }

  upsert(points: DomesticPricePoint[]): { inserted: number; updated: number } {
    const exists = this.db.prepare('SELECT 1 AS x FROM domestic_prices WHERE commodity=? AND region=? AND date=? AND source=?');
    const ins = this.db.prepare(
      `INSERT INTO domestic_prices (commodity, region, date, source, price, unit, currency, source_url, quality, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (commodity, region, date, source) DO UPDATE SET
         price=excluded.price, unit=excluded.unit, currency=excluded.currency,
         source_url=excluded.source_url, quality=excluded.quality`
    );
    const out = { inserted: 0, updated: 0 };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const p of points) {
        if (exists.get(p.commodity, p.region, p.date, p.source)) out.updated++;
        else out.inserted++;
        ins.run(p.commodity, p.region, p.date, p.source, p.price, p.unit, p.currency, p.sourceUrl, p.quality, new Date().toISOString());
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return out;
  }

  latest(commodity: DomesticCommodity): DomesticPricePoint | null {
    const r = this.db
      .prepare('SELECT * FROM domestic_prices WHERE commodity=? ORDER BY date DESC, created_at DESC LIMIT 1')
      .get(commodity) as unknown as Row | undefined;
    return r ? toPoint(r) : null;
  }

  history(commodity: DomesticCommodity, region: string, sinceDate: string): DomesticPricePoint[] {
    const rows = this.db
      .prepare('SELECT * FROM domestic_prices WHERE commodity=? AND region=? AND date>=? ORDER BY date ASC')
      .all(commodity, region, sinceDate) as unknown as Row[];
    return rows.map(toPoint);
  }

  close(): void {
    this.db.close();
  }
}
