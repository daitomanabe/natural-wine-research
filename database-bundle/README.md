# Database bundle for website rebuild

This folder contains all currently persisted data used by the current Natural Wine Research app:

- catalog seed ('catalog-seed.json')
- user catalog additions ('catalog-additions.json')
- merged catalog ('catalog-unified.json')
- inventory records ('inventory-raw.json')
- inventory with catalog joins ('inventory-materialized.json')
- inventory summary with units/location grouping ('inventory-summary.json')
- OCR/label metadata ('labels.json')
- live kiosk context ('live-context.json')
- build stats snapshot ('catalog-stats.json')
- source watchlist used for collection ('source-watchlist.json')
- one-file combined payload ('bundle-combined.json')
- snapshot summary ('OVERVIEW.json' and 'OVERVIEW.md')

## Rebuild steps

1. Run `npm run bundle:export`.
2. Commit or copy the generated `database-bundle` folder into the new website repo.
3. In the new website, load:
   - `catalog-unified.json` for default catalog rendering
   - `labels.json` for OCR + label visuals
   - `inventory-materialized.json` for inventory enrichment
   - `live-context.json` and `inventory-summary.json` for iPad kiosk defaults and inventory snapshots

## Data generation metadata

- Generated at (UTC): `2026-04-04T12:01:42.100Z`
- Seed count: `42`
- Unified catalog count: `677`
- Inventory count: `0`
- Label count: `0`
