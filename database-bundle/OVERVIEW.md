# Natural Wine Research — Database Bundle

Generated: 2026/04/30 22:06

## 1) Database Snapshot

- Seed catalog (base DB): `42`
- Custom additions: `18125`
- Unified catalog total: `18167`
- Inventory records: `5`
- Linked inventory records: `5`
- Inventory bottles (sum of quantities): `5`
- Label assets: `0`
- Live context loaded: `natural wine` @ `n/a`

## 2) Data Files Included

- `catalog-seed.json`
- `catalog-additions.json`
- `catalog-unified.json`
- `inventory-raw.json`
- `inventory-materialized.json`
- `inventory-summary.json`
- `live-context.json`
- `labels.json`
- `source-watchlist.json`
- `bundle-combined.json`
- `catalog-stats.json`

## 3) Source Watchlist

- Total sources: `34`
- Enabled sources: `30`

## 4) Rebuild Guidance

- Import `catalog-unified.json` for one-click catalog bootstrap.
- `inventory-raw.json` preserves manual inventory rows.
- `inventory-materialized.json` includes resolved catalog joins for UI use.
- `catalog-seed.json` and `catalog-additions.json` are useful for migration diffs.
- `inventory-summary.json` stores bottle-count rollups by wine/location.
- `live-context.json` stores last saved live kiosk context.
- `catalog-stats.json` stores UI/build stats snapshot.
- `labels.json` stores label OCR/visual metadata.
- `source-watchlist.json` keeps planned and executable collection sources.
