# Natural Wine Research — Database Bundle

Generated: 2026/03/27 18:53

## 1) Database Snapshot

- Seed catalog (base DB): `42`
- Custom additions: `0`
- Unified catalog total: `42`
- Inventory records: `0`
- Linked inventory records: `0`
- Label assets: `0`

## 2) Data Files Included

- `catalog-seed.json`
- `catalog-additions.json`
- `catalog-unified.json`
- `inventory-raw.json`
- `inventory-materialized.json`
- `labels.json`
- `source-watchlist.json`
- `bundle-combined.json`

## 3) Source Watchlist

- Total sources: `5`
- Enabled sources: `1`

## 4) Rebuild Guidance

- Import `catalog-unified.json` for one-click catalog bootstrap.
- `inventory-raw.json` preserves manual inventory rows.
- `inventory-materialized.json` includes resolved catalog joins for UI use.
- `catalog-seed.json` and `catalog-additions.json` are useful for migration diffs.
- `labels.json` stores label OCR/visual metadata.
- `source-watchlist.json` keeps planned and executable collection sources.
