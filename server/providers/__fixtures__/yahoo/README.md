# Yahoo chart fixture (T30)

`ZC_F_5d_1d.json` is an unmodified copy of one real response, used by `server/providers/yahooAdapter.test.ts`.

- URL: `https://query1.finance.yahoo.com/v8/finance/chart/ZC%3DF?range=5d&interval=1d`
- Fetched: 2026-11-17T18:08:02Z (UTC), anonymous request with a generic User-Agent
- Returned: `exchangeName` CBT (CBOT), `currency` USX (US cents), `regularMarketPrice` 448.75,
  `regularMarketTime` 1794938279 (2026-11-17T17:57:59Z), 4 daily bars dated 05:00Z (midnight New York).

Yahoo data is UNOFFICIAL and for personal use only; this fixture exists solely for tests.
