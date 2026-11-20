# Nguồn giá còn thiếu / Missing price sources

Checked 2026-11-20. Rule: nothing is fabricated; every number carries its source and as-of date. A monthly
benchmark is **not** a futures quote: it is shown as "Giá tham chiếu" (`kind: BENCHMARK`, status
HISTORICAL, or STALE by age), never CURRENT/DELAYED, never stored as candles, and not used by the
technical/scorecard/brief engines as a futures bar.

## Per instrument

| Instrument | Shown now | Free options checked | Result |
|---|---|---|---|
| RC (ICE Europe Robusta) | IMF monthly benchmark `PCOFFROBUSDM` (US cents/lb) converted to USD/MT with the exact factor 22.0462 (1 t = 2,204.62 lb); original value kept in `benchmark.nativeValue` | Yahoo `RC=F` | Not found. ICE Europe data is licensed. |
| CT (ICE US Cotton No.2) | IMF `PCOTTINDUSDM` (Cotlook A index, cents/lb, native unit). Cotlook A is not ICE CT. | Yahoo `CT=F` | Resolves to exchange NYM at 79.55 USX (not ICE US); rejected. |
| BRN (ICE Brent) | EIA daily Europe Brent **spot FOB** `DCOILBRENTEU` (USD/barrel), via FRED. A spot price, not the ICE futures settlement. | Yahoo `BZ=F` | NYMEX "Brent Last Day Financial", not ICE Brent; rejected. |
| TIO (CME iron ore 62% Fe CFR) | IMF `PIORECRUSDM` (China import iron ore fines 62% Fe, USD/MT, native unit; the contract is quoted per DMT, so no conversion is claimed) | Yahoo `TIO=F` | COMEX at 161.91 USD, which does not match iron ore (about 100 USD/t); rejected. |
| FEF (SGX iron ore) | Same IMF series as TIO | Yahoo `FEF` / `SGX:FEF` | Not found. |
| JRU (Osaka rubber, JPY/kg) | IMF `PRUBBUSDM` (Singapore RSS3, USD cents/lb, native). No JPY/kg conversion (would need an FX rate and a different grade). | none on Yahoo | Not available. |

FRED series were verified through `https://fred.stlouisfed.org/graph/fredgraph.csv?id=<ID>` (no key
needed): all five exist and had data through 2026-09 (monthly) / 2026-11-17 (Brent). Monthly values lag by
5-7 weeks. Publisher: IMF Primary Commodity Prices and EIA, redistributed by FRED. Fetched lazily and
refreshed every 6 h (disable with `FRED_PUBLIC_CSV_ENABLED=false`).

## Per-contract-month curve (term structure)

Checked live 2026-11-21 against `https://query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>?range=5d&interval=1d`
and `/v8/finance/spark?symbols=...&range=5d&interval=1d`. Yahoo does serve individual contract months with the
format `<ROOT><monthCode><YY>.<EXCH>` (e.g. `ZCZ26.CBT`, `ZCH27.CBT`, `CLF27.NYM`, `GCG27.CMX`, `KCH27.NYB`).
Verified responses: ZC/GC/KC on CBT/CMX/NYB report `instrumentType=FUTURE` with the expected `exchangeName` and
`currency` (`USX` for CBOT, `USD` for NYMEX/COMEX), so the term-structure view can price the next listed months.

Rules applied (T47): month codes come only from the app contract calendar (`src/shared/contracts`), never guessed;
the front month is validated fail-closed (exchange, currency and `instrumentType=FUTURE` must match the instrument
mapping); all months must share one common valuation date; the last trading day is computed by the app calendar,
not read from Yahoo. Every point is labelled UNOFFICIAL, delayed, not an exchange settlement, with the contract
code, Yahoo symbol and bar date. Results are cached ~15 min per instrument. Far months can be illiquid and their
close may be indicative; a month with no bar or a stale bar is listed in `excluded` with the reason.

If Yahoo stops serving contract months (or Yahoo is disabled with `YAHOO_ENABLED=false`), the term-structure view
shows the reason and points to the CSV import path: **Data > Import CSV** with per-contract codes such as `ZCH27`
(see [DATA_IMPORT.md](DATA_IMPORT.md)). Imported per-contract candles are the authoritative source and can also
rebuild a curve for a historical date. Instruments with no verified Yahoo symbol mapping (RC, CT, BRN, TIO, FEF,
JRU) still have no per-contract-month source; only the benchmark/CSV paths above apply.

## Paid / licensed options (not implemented)

- **Barchart OnDemand**: delayed or real-time quotes and history for ICE, CME, SGX futures; commercial licence.
- **Databento**: CME Globex (MDP3) and ICE Futures US/Europe tick and OHLCV data, pay-as-you-go; exchange fees apply.
- **TwelveData (commercial plan)**: some futures and commodity series; exchange coverage of ICE Europe and SGX must be confirmed per symbol.
- **ICE Connect / ICE Data Services**: the authoritative source for RC, CT and BRN; enterprise licence.
- **CME DataMine / CME Group market data**: TIO, plus CBOT, NYMEX and COMEX; licensed redistribution.
- **MXV via a member broker**: Vietnamese-market prices for LRC, FEF, etc., through a broker account or the MXV API (`MXV_API_URL` / `MXV_API_KEY`).

## CSV-import fallback

If you own a legitimate export (broker platform, Barchart download, etc.), import it as real daily
candles: see [DATA_IMPORT.md](DATA_IMPORT.md). Imported candles win over the FRED benchmark and are shown
as "Giá đóng cửa gần nhất" with the bar date.
