import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DB as SEED_DB } from "../src/data/wines.js";
import { buildCatalogStats, listCatalog, mapCatalogById } from "../server/lib/catalog.mjs";
import { DATA_DIR } from "../server/lib/paths.mjs";
import {
  listInventory,
  materializeInventory,
  summarizeInventory,
} from "../server/lib/inventory.mjs";
import { listLabels } from "../server/lib/labels.mjs";
import { listSources } from "../server/lib/sources.mjs";
import { getLiveContext } from "../server/lib/context.mjs";
import { readJson } from "../server/lib/storage.mjs";

const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_BUNDLE_DIR = path.join(ROOT_DIR, "database-bundle");
const DATA_DIR_FILES = {
  catalogSeed: "catalog-seed.json",
  catalogAdditions: "catalog-additions.json",
  catalogUnified: "catalog-unified.json",
  inventoryRaw: "inventory-raw.json",
  inventoryMaterialized: "inventory-materialized.json",
  inventorySummary: "inventory-summary.json",
  liveContext: "live-context.json",
  labels: "labels.json",
  sourceWatchlist: "source-watchlist.json",
  combined: "bundle-combined.json",
  catalogStats: "catalog-stats.json",
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

function buildOverview({ catalog, additions, inventory, materializedInventory, labels, watchlist, liveContext, inventorySummary, catalogStats }) {
  const catalogMap = mapCatalogById(catalog);
  return {
    generatedAt: new Date().toISOString(),
    database: {
      seedCount: SEED_DB.length,
      additionsCount: additions.length,
      unifiedCount: catalog.length,
      inventoryCount: inventory.length,
      inventoryUnits: inventorySummary.totalQuantity,
      linkedInventoryCount: materializedInventory.filter((item) => item.wine).length,
      labelAssetCount: labels.length,
      linkedCatalogCount: catalogStats.inventoryLinked,
      catalogWithLinkCount: [...catalogMap.keys()].length,
      catalogPlottableCount: catalogStats.plottable,
      combinedDataSize: JSON.stringify(catalog).length,
    },
    live: {
      city: liveContext.city,
      headlineTopic: liveContext.headlineTopic,
      updatedAt: liveContext.updatedAt,
      track: liveContext.track,
    },
    collections: Object.entries(DATA_DIR_FILES).map(([key, value]) => ({ name: key, file: `${value}` })),
    sourceWatchlist: {
      total: watchlist.length,
      enabled: watchlist.filter((item) => item.enabled !== false).length,
    },
    inventorySummary,
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
- Inventory bottles (sum of quantities): \`${overview.database.inventoryUnits}\`
- Label assets: \`${overview.database.labelAssetCount}\`
- Live context loaded: \`${overview.live?.headlineTopic || "n/a"}\` @ \`${overview.live?.updatedAt || "n/a"}\`

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
- \`inventory-summary.json\` stores bottle-count rollups by wine/location.
- \`live-context.json\` stores last saved live kiosk context.
- \`catalog-stats.json\` stores UI/build stats snapshot.
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
- inventory summary with units/location grouping ('inventory-summary.json')
- OCR/label metadata ('labels.json')
- live kiosk context ('live-context.json')
- build stats snapshot ('catalog-stats.json')
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
   - \`live-context.json\` and \`inventory-summary.json\` for iPad kiosk defaults and inventory snapshots

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
const liveContext = await getLiveContext();
const inventorySummary = summarizeInventory(inventory);
const catalogStats = buildCatalogStats(catalog, materializedInventory, labels);
const combined = {
  generatedAt: new Date().toISOString(),
  catalogSeed,
  catalogAdditions,
  catalog,
  inventory,
  materializedInventory,
  inventorySummary,
  labels,
  catalogStats,
  watchlist,
  liveContext,
};

const overview = buildOverview({
  catalog,
  additions: catalogAdditions,
  inventory,
  materializedInventory,
  labels,
  watchlist,
  liveContext,
  inventorySummary,
  catalogStats,
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
  path.join(DATA_BUNDLE_DIR, DATA_DIR_FILES.inventorySummary),
  JSON.stringify(inventorySummary, null, 2),
  "utf8",
);
await fs.writeFile(
  path.join(DATA_BUNDLE_DIR, DATA_DIR_FILES.liveContext),
  JSON.stringify(liveContext, null, 2),
  "utf8",
);
await fs.writeFile(
  path.join(DATA_BUNDLE_DIR, DATA_DIR_FILES.catalogStats),
  JSON.stringify(catalogStats, null, 2),
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
