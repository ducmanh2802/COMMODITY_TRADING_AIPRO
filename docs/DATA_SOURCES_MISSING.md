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
