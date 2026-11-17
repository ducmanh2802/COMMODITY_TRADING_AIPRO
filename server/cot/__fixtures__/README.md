# COT test fixtures — provenance

Both CSV files are **verbatim excerpts** (header row + the first 3 data rows for CFTC contract market
code `002602`, CORN - CHICAGO BOARD OF TRADE) of official CFTC files. No value was edited.

| Fixture | Source URL | File inside zip | Fetched (UTC) | Zip SHA-256 |
|---|---|---|---|---|
| `cftc_disagg_fut_2026_corn_002602.csv` | https://www.cftc.gov/files/dea/history/fut_disagg_txt_2026.zip | `f_year.txt` (Disaggregated Futures Only, 2026) | 2026-11-17 11:26 | `64f5c820c086b793c34d6527013144958689da731a782eebea4ddc958f610542` |
| `cftc_legacy_fut_2026_corn_002602.csv` | https://www.cftc.gov/files/dea/history/deacot2026.zip | `annual.txt` (Legacy Futures Only, 2026) | 2026-11-17 11:26 | `a7f87e9e0f0239a17e5323984de31a8bf429ba8578f6d76062baceb8761ea8ff` |

Rows: report dates 2026-11-10, 2026-11-03, 2026-10-27 (as published, newest first).

Extraction command (Git Bash): `{ head -1 f_year.txt; grep ',002602,' f_year.txt | head -3; }`.

## Why not a Socrata JSON response?

The live sync uses the Socrata API (`https://publicreporting.cftc.gov/resource/72hh-3qpy.json`,
`.../6dca-aqww.json`). On 2026-11-17 every request from the development environment to
`publicreporting.cftc.gov` (JSON, catalog and home page) returned **HTTP 403 Forbidden** from the
Socrata edge, so no JSON response could be captured. `www.cftc.gov` was reachable, so the fixtures are
taken from CFTC's official text files of the same reports. The parser normalizes field names
(e.g. `Report_Date_as_YYYY-MM-DD` → `report_date_as_yyyy_mm_dd`, the Socrata field name), so the same
code path parses both. When Socrata becomes reachable, add a captured JSON fixture alongside these.
