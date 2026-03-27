# Database bundle for website rebuild

This folder contains all currently persisted data used by the current Natural Wine Research app:

- catalog seed ('catalog-seed.json')
- user catalog additions ('catalog-additions.json')
- merged catalog ('catalog-unified.json')
- inventory records ('inventory-raw.json')
- inventory with catalog joins ('inventory-materialized.json')
- OCR/label metadata ('labels.json')
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

## Data generation metadata

- Generated at (UTC): `2026-03-27T09:53:34.045Z`
- Seed count: `42`
- Unified catalog count: `42`
- Inventory count: `0`
- Label count: `0`
