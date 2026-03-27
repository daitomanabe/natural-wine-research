import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DB as SEED_DB } from "../src/data/wines.js";
import { listCatalog, mapCatalogById } from "../server/lib/catalog.mjs";
import { DATA_DIR } from "../server/lib/paths.mjs";
import { listInventory, materializeInventory } from "../server/lib/inventory.mjs";
import { listLabels } from "../server/lib/labels.mjs";
import { listSources } from "../server/lib/sources.mjs";
import { readJson } from "../server/lib/storage.mjs";

const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_BUNDLE_DIR = path.join(ROOT_DIR, "database-bundle");
const DATA_DIR_FILES = {
  catalogSeed: "catalog-seed.json",
  catalogAdditions: "catalog-additions.json",
  catalogUnified: "catalog-unified.json",
  inventoryRaw: "inventory-raw.json",
  inventoryMaterialized: "inventory-materialized.json",
  labels: "labels.json",
  sourceWatchlist: "source-watchlist.json",
  combined: "bundle-combined.json",
};

function formatDate(value) {
  return new Date(value).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildOverview({ catalog, additions, inventory, materializedInventory, labels, watchlist }) {
  const catalogMap = mapCatalogById(catalog);
  const linkedInventory = materializedInventory.filter((item) => item.wine).length;

  return {
    generatedAt: new Date().toISOString(),
    database: {
      seedCount: SEED_DB.length,
      additionsCount: additions.length,
      unifiedCount: catalog.length,
      inventoryCount: inventory.length,
      linkedInventoryCount: linkedInventory,
      labelAssetCount: labels.length,
      catalogWithLinkCount: [...catalogMap.keys()].length,
      combinedDataSize: JSON.stringify(catalog).length,
    },
    collections: Object.entries(DATA_DIR_FILES).map(([key, value]) => ({ name: key, file: `${value}` })),
    sourceWatchlist: {
      total: watchlist.length,
      enabled: watchlist.filter((item) => item.enabled !== false).length,
    },
  };
}

function markdownOverview(overview) {
  return `# Natural Wine Research — Database Bundle

Generated: ${formatDate(overview.generatedAt)}

## 1) Database Snapshot

- Seed catalog (base DB): \`${overview.database.seedCount}\`
- Custom additions: \`${overview.database.additionsCount}\`
- Unified catalog total: \`${overview.database.unifiedCount}\`
- Inventory records: \`${overview.database.inventoryCount}\`
- Linked inventory records: \`${overview.database.linkedInventoryCount}\`
- Label assets: \`${overview.database.labelAssetCount}\`

## 2) Data Files Included

${overview.collections.map((item) => `- \`${item.file}\``).join("\n")}

## 3) Source Watchlist

- Total sources: \`${overview.sourceWatchlist.total}\`
- Enabled sources: \`${overview.sourceWatchlist.enabled}\`

## 4) Rebuild Guidance

- Import \`catalog-unified.json\` for one-click catalog bootstrap.
- \`inventory-raw.json\` preserves manual inventory rows.
- \`inventory-materialized.json\` includes resolved catalog joins for UI use.
- \`catalog-seed.json\` and \`catalog-additions.json\` are useful for migration diffs.
- \`labels.json\` stores label OCR/visual metadata.
- \`source-watchlist.json\` keeps planned and executable collection sources.
`;
}

function markdownReadme(overview) {
  return `# Database bundle for website rebuild

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

1. Run \`npm run bundle:export\`.
2. Commit or copy the generated \`database-bundle\` folder into the new website repo.
3. In the new website, load:
   - \`catalog-unified.json\` for default catalog rendering
   - \`labels.json\` for OCR + label visuals
   - \`inventory-materialized.json\` for inventory enrichment

## Data generation metadata

- Generated at (UTC): \`${overview.generatedAt}\`
- Seed count: \`${overview.database.seedCount}\`
- Unified catalog count: \`${overview.database.unifiedCount}\`
- Inventory count: \`${overview.database.inventoryCount}\`
- Label count: \`${overview.database.labelAssetCount}\`
`;
}

await fs.mkdir(DATA_BUNDLE_DIR, { recursive: true });

const catalog = await listCatalog();
const catalogAdditions = await readJson(path.join(DATA_DIR, "catalog-additions.json"), []);
const catalogSeed = SEED_DB.map((wine) => wine);
const inventory = await listInventory();
const labels = await listLabels();
const watchlist = await listSources();
const materializedInventory = materializeInventory(inventory, mapCatalogById(catalog));
const combined = {
  generatedAt: new Date().toISOString(),
  catalogSeed,
  catalogAdditions,
  catalog,
  inventory,
  materializedInventory,
  labels,
  watchlist,
};

const overview = buildOverview({
  catalog,
  additions: catalogAdditions,
  inventory,
  materializedInventory,
  labels,
  watchlist,
});

await fs.writeFile(
  path.join(DATA_BUNDLE_DIR, DATA_DIR_FILES.catalogSeed),
  JSON.stringify(catalogSeed, null, 2),
  "utf8",
);
await fs.writeFile(
  path.join(DATA_BUNDLE_DIR, DATA_DIR_FILES.catalogAdditions),
  JSON.stringify(catalogAdditions, null, 2),
  "utf8",
);
await fs.writeFile(
  path.join(DATA_BUNDLE_DIR, DATA_DIR_FILES.catalogUnified),
  JSON.stringify(catalog, null, 2),
  "utf8",
);
await fs.writeFile(
  path.join(DATA_BUNDLE_DIR, DATA_DIR_FILES.inventoryRaw),
  JSON.stringify(inventory, null, 2),
  "utf8",
);
await fs.writeFile(
  path.join(DATA_BUNDLE_DIR, DATA_DIR_FILES.inventoryMaterialized),
  JSON.stringify(materializedInventory, null, 2),
  "utf8",
);
await fs.writeFile(
  path.join(DATA_BUNDLE_DIR, DATA_DIR_FILES.labels),
  JSON.stringify(labels, null, 2),
  "utf8",
);
await fs.writeFile(
  path.join(DATA_BUNDLE_DIR, DATA_DIR_FILES.sourceWatchlist),
  JSON.stringify(watchlist, null, 2),
  "utf8",
);
await fs.writeFile(
  path.join(DATA_BUNDLE_DIR, DATA_DIR_FILES.combined),
  JSON.stringify(combined, null, 2),
  "utf8",
);
await fs.writeFile(
  path.join(DATA_BUNDLE_DIR, "OVERVIEW.json"),
  JSON.stringify(overview, null, 2),
  "utf8",
);
await fs.writeFile(path.join(DATA_BUNDLE_DIR, "OVERVIEW.md"), markdownOverview(overview), "utf8");
await fs.writeFile(path.join(DATA_BUNDLE_DIR, "README.md"), markdownReadme(overview), "utf8");
