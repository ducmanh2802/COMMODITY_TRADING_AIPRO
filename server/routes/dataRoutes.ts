import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import { DATE_FORMATS, TIMEFRAMES } from '../data/csvOhlcvParser.ts';
import { importCsv, type ImportStatus } from '../data/importService.ts';
import { isValidTimeZone } from '../data/timeZones.ts';
import { requireAdminToken } from '../middleware/adminAuth.ts';
import { storedRowToMarketCandle } from '../providers/csvHistorical.ts';
import {
  CONTINUOUS_ADJUSTMENTS,
  IMPORT_MODES,
  SOURCE_QUALITIES,
  type DatasetRecord,
  type ICandleRepository,
} from '../storage/candleRepository.ts';

export interface DataRoutesDeps {
  findInstrument: (idOrSymbol: string) => Promise<InstrumentDefinition | null>;
  candles: ICandleRepository;
  /** Guard for the mutating routes (import, delete). Default: `requireAdminToken` (env ADMIN_API_TOKEN). */
  requireAdmin?: RequestHandler;
}

const InstrumentIdSchema = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9:_-]+$/);
const ContractCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9._-]+$/)
  .transform((s) => s.toUpperCase());

const ImportBodySchema = z.strictObject({
  instrumentId: InstrumentIdSchema,
  contractCode: ContractCodeSchema,
  timeframe: z.enum(TIMEFRAMES),
  csv: z.string().min(1),
  dateFormat: z.enum(DATE_FORMATS).optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isValidTimeZone, { message: 'Must be a valid IANA timezone, e.g. America/Chicago.' }),
  decimalSeparator: z.enum(['.', ',']).optional(),
  delimiter: z.enum([',', ';']).optional(),
  sourceLabel: z.string().trim().min(1).max(200),
  sourceQuality: z.enum(SOURCE_QUALITIES),
  priceUnit: z.string().trim().min(1).max(64).optional(),
  continuousAdjustment: z.enum(CONTINUOUS_ADJUSTMENTS).optional(),
  mode: z.enum(IMPORT_MODES).default('reject_conflicts'),
  sort: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  gapThresholdSessions: z.number().int().min(1).max(260).optional(),
  jumpThresholdPct: z.number().positive().max(1000).optional(),
  /** Accept zero/negative OHLC (implied for CONTINUOUS + BACK_ADJUSTED). Each such bar is still warned. */
  allowNonPositivePrices: z.boolean().optional(),
});

const DatasetsQuerySchema = z.object({ instrumentId: InstrumentIdSchema.optional() });
const DatasetIdParamSchema = z.object({ id: z.uuid() });

const IsoTimestampSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((s) => /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s)), {
    message: 'Must be an ISO-8601 date or timestamp (dates are read as 00:00:00Z).',
  });

const CandlesQuerySchema = z
  .object({
    instrumentId: InstrumentIdSchema,
    contractCode: ContractCodeSchema,
    timeframe: z.enum(TIMEFRAMES),
    from: IsoTimestampSchema.optional(),
    to: IsoTimestampSchema.optional(),
    limit: z.coerce.number().int().min(1).max(20_000).default(5_000),
  })
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
    message: '`from` must be <= `to`.',
    path: ['from'],
  });

const IMPORT_STATUS_HTTP: Record<ImportStatus, number> = {
  IMPORTED: 201,
  DRY_RUN_OK: 200,
  NO_CHANGES: 200,
  INSTRUMENT_NOT_FOUND: 404,
  INVALID_REQUEST: 422,
  REJECTED_INVALID_DATA: 422,
  REJECTED_CONFLICTS: 409,
  REJECTED_SERIES_MISMATCH: 409,
};

function validationError(res: Response, message: string, issues: z.core.$ZodIssue[]): void {
  res.status(400).json({
    error: 'VALIDATION_ERROR',
    message,
    details: issues.map((i) => ({ path: i.path, code: i.code, message: i.message })),
  });
}

function datasetProvenance(d: DatasetRecord) {
  return {
    datasetId: d.id,
    sourceLabel: d.sourceLabel,
    sourceQuality: d.sourceQuality,
    importedAt: d.importedAt,
    checksum: d.checksum,
    timezone: d.timezone,
    dateFormat: d.dateFormat,
    priceUnit: d.priceUnit,
    priceUnitDeclared: d.priceUnitDeclared,
    continuousAdjustment: d.continuousAdjustment,
    firstTimestamp: d.firstTimestamp,
    lastTimestamp: d.lastTimestamp,
  };
}

export const TIMESTAMP_CONVENTION =
  'D1/W1: trading-session date as written in the source, at 00:00:00Z. Intraday: source wall-clock time converted from the declared timezone to UTC.';

/**
 * Registers the historical-data routes. Must be called after the JSON body parsers and before the
 * /api 404 handler. The import route's larger body limit is configured by the caller (app.ts).
 */
export function registerDataRoutes(app: Express, deps: DataRoutesDeps): void {
  const requireAdmin = deps.requireAdmin ?? requireAdminToken;

  app.post('/api/data/import', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ImportBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        validationError(res, 'Invalid import request.', parsed.error.issues);
        return;
      }
      const result = await importCsv(parsed.data, {
        findInstrument: deps.findInstrument,
        candles: deps.candles,
      });
      const httpStatus = IMPORT_STATUS_HTTP[result.status];
      if (result.ok) {
        res.status(httpStatus).json(result);
      } else {
        res.status(httpStatus).json({ error: result.status, ...result });
      }
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/data/datasets', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = DatasetsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        validationError(res, 'Invalid datasets query parameters.', parsed.error.issues);
        return;
      }
      let instrumentId: string | undefined;
      if (parsed.data.instrumentId) {
        const instrument = await deps.findInstrument(parsed.data.instrumentId);
        if (!instrument) {
          res.status(404).json({
            error: 'INSTRUMENT_NOT_FOUND',
            message: `Instrument ${parsed.data.instrumentId} is not registered in the Instrument Master.`,
          });
          return;
        }
        instrumentId = instrument.id;
      }
      const datasets = await deps.candles.listDatasets({ instrumentId });
      res.json({ retrievedAt: new Date().toISOString(), count: datasets.length, datasets });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/data/datasets/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = DatasetIdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        validationError(res, 'Invalid dataset id.', parsed.error.issues);
        return;
      }
      const result = await deps.candles.deleteDataset(parsed.data.id);
      if (!result.deleted) {
        res.status(404).json({ error: 'DATASET_NOT_FOUND', message: `Dataset ${parsed.data.id} does not exist.` });
        return;
      }
      res.json({ deleted: true, datasetId: parsed.data.id, candlesDeleted: result.candlesDeleted });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/market/candles', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CandlesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        validationError(res, 'Invalid candles query parameters.', parsed.error.issues);
        return;
      }
      const q = parsed.data;
      const instrument = await deps.findInstrument(q.instrumentId);
      if (!instrument) {
        res.status(404).json({
          error: 'INSTRUMENT_NOT_FOUND',
          message: `Instrument ${q.instrumentId} is not registered in the Instrument Master.`,
        });
        return;
      }
      const key = { instrumentId: instrument.id, contractCode: q.contractCode, timeframe: q.timeframe };
      const result = await deps.candles.queryCandles(key, {
        fromMs: q.from ? Date.parse(q.from) : undefined,
        toMs: q.to ? Date.parse(q.to) : undefined,
        limit: q.limit,
      });

      const datasetIds = [...new Set(result.rows.map((r) => r.datasetId))];
      const datasets: DatasetRecord[] = [];
      for (const id of datasetIds) {
        const d = await deps.candles.getDataset(id);
        if (d) datasets.push(d);
      }
      const byId = new Map(datasets.map((d) => [d.id, d]));
      const symbol = q.contractCode === 'CONTINUOUS' ? `${instrument.exchangeSymbol}:CONTINUOUS` : q.contractCode;

      const common = {
        retrievedAt: new Date().toISOString(),
        instrumentId: instrument.id,
        exchange: instrument.exchange,
        contractCode: q.contractCode,
        timeframe: q.timeframe,
        timestampConvention: TIMESTAMP_CONVENTION,
      };
      if (result.rows.length === 0) {
        res.json({
          ...common,
          status: 'UNAVAILABLE',
          reason: 'DATA_UNAVAILABLE — no imported candles for this series and range.',
          priceUnit: null,
          continuousAdjustment: null,
          count: 0,
          totalInRange: 0,
          truncated: false,
          candles: [],
          provenance: [],
        });
        return;
      }
      res.json({
        ...common,
        status: 'HISTORICAL',
        priceUnit: datasets[0]?.priceUnit ?? null,
        continuousAdjustment: datasets[0]?.continuousAdjustment ?? null,
        count: result.rows.length,
        totalInRange: result.totalInRange,
        truncated: result.truncated,
        candles: result.rows.map((r) => ({
          ...storedRowToMarketCandle(r, {
            symbol,
            exchange: instrument.exchange,
            timeframe: q.timeframe,
            retrievedAt: byId.get(r.datasetId)?.importedAt ?? '',
          }),
          datasetId: r.datasetId,
        })),
        provenance: datasets.map(datasetProvenance),
      });
    } catch (err) {
      next(err);
    }
  });
}
