/**
 * T63 - /api/contest/*: monthly paper-trading contest ("Cuộc đua giao dịch thử"). Learning only.
 *   GET  /season, GET /leaderboard[?season=YYYY-MM]   public (anonymised)
 *   GET  /me, POST /join, POST /orders, POST /positions/:id/close   need a Firebase ID token (Authorization: Bearer)
 */
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import { createFirebaseVerifier, type TokenVerifier } from '../services/contest/auth.ts';
import { ContestEngine, ContestError, type ContestDeps } from '../services/contest/engine.ts';
import { SEASON_RE } from '../services/contest/season.ts';
import { ContestStore } from '../services/contest/store.ts';

export interface ContestRouteOptions {
  /** Engine deps minus the store (the store is opened lazily on first use unless `store` is given). */
  deps: Omit<ContestDeps, 'store'>;
  store?: ContestStore;
  verifier?: TokenVerifier | null;
}

const JoinSchema = z.object({ displayName: z.string().max(60).optional() }).strict();
const OrderSchema = z
  .object({
    instrumentId: z.string().min(1).max(64).regex(/^[A-Za-z0-9._:=-]+$/),
    side: z.enum(['LONG', 'SHORT']),
    contracts: z.number().int().min(1).max(100),
    stop: z.number().positive().finite().nullable().optional(),
    target: z.number().positive().finite().nullable().optional(),
    checklistDone: z.boolean().nullable().optional(),
  })
  .strict();

export function registerContestRoutes(app: Express, options: ContestRouteOptions): { engine: () => ContestEngine } {
  let engine: ContestEngine | null = null;
  const getEngine = (): ContestEngine => (engine ??= new ContestEngine({ ...options.deps, store: options.store ?? new ContestStore() }));
  let verifier: TokenVerifier | null | undefined = options.verifier;
  const getVerifier = (): TokenVerifier | null => {
    if (verifier === undefined) verifier = createFirebaseVerifier();
    return verifier;
  };
  app.locals.contest = { runStopCheck: () => getEngine().runStopCheck() };

  const writeLimit = createRateLimiter({ windowMs: 60_000, max: 30 });

  const requireAuth: RequestHandler = async (req, res, next) => {
    const m = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
    if (!m) {
      res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Sign in to use the contest.' });
      return;
    }
    const v = getVerifier();
    if (!v) {
      res.status(503).json({ error: 'AUTH_UNAVAILABLE', message: 'Token verification is not configured on this server.' });
      return;
    }
    let who: { uid: string } | null = null;
    try {
      who = await v(m[1]);
    } catch {
      who = null;
    }
    if (!who) {
      res.status(401).json({ error: 'AUTH_INVALID', message: 'Invalid or expired sign-in token.' });
      return;
    }
    res.locals.uid = who.uid;
    next();
  };

  const wrap =
    (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json(await fn(req, res));
      } catch (err) {
        if (err instanceof ContestError) {
          res.status(err.status).json({ error: err.code, message: err.message });
          return;
        }
        next(err);
      }
    };

  app.get('/api/contest/season', wrap(() => getEngine().seasonInfo()));

  app.get(
    '/api/contest/leaderboard',
    wrap((req) => {
      const e = getEngine();
      const q = typeof req.query.season === 'string' ? req.query.season : e.currentSeason();
      if (!SEASON_RE.test(q)) throw new ContestError('BAD_SEASON', 400, 'season must be YYYY-MM');
      return { season: q, rows: e.leaderboard(q) };
    }),
  );

  app.get('/api/contest/me', requireAuth, wrap((_req, res) => {
    const e = getEngine();
    const me = e.me(res.locals.uid as string);
    return { ...me, leaderboard: e.leaderboard(e.currentSeason(), res.locals.uid as string) };
  }));

  app.post(
    '/api/contest/join',
    writeLimit,
    requireAuth,
    wrap((req, res) => {
      const p = JoinSchema.safeParse(req.body ?? {});
      if (!p.success) throw new ContestError('VALIDATION_ERROR', 400, 'Invalid join request.');
      const e = getEngine();
      e.join(res.locals.uid as string, p.data.displayName);
      e.recompute(e.currentSeason());
      return e.me(res.locals.uid as string);
    }),
  );

  app.post(
    '/api/contest/orders',
    writeLimit,
    requireAuth,
    wrap(async (req, res) => {
      const p = OrderSchema.safeParse(req.body);
      if (!p.success) throw new ContestError('VALIDATION_ERROR', 400, 'Invalid order.');
      const { order, position } = await getEngine().placeOrder(res.locals.uid as string, p.data);
      const { uid: _u, ...o } = order;
      const { uid: _v, ...pos } = position;
      return { order: o, position: pos };
    }),
  );

  app.post(
    '/api/contest/positions/:id/close',
    writeLimit,
    requireAuth,
    wrap(async (req, res) => {
      const id = String(req.params.id);
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ContestError('NOT_FOUND', 404, 'Position not found.');
      const { uid: _u, ...pos } = await getEngine().closePosition(res.locals.uid as string, id);
      return { position: pos };
    }),
  );

  return { engine: getEngine };
}
