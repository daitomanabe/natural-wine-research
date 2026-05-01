import path from "node:path";
import { enrichFikaCatalogRecord, needsFikaMetadataEnrichment } from "../server/lib/source-fika.mjs";
import { DATA_DIR } from "../server/lib/paths.mjs";
import { readJson, writeJson } from "../server/lib/storage.mjs";

const CATALOG_ADDITIONS_FILE = path.join(DATA_DIR, "catalog-additions.json");
const args = process.argv.slice(2);

function parseOption(name, fallback = null) {
  const arg = args.find((item, index) => {
    if (item.startsWith(`--${name}=`)) return true;
    if (item === `--${name}` && args[index + 1]) return true;
    return false;
  });

  if (!arg) return fallback;
  if (arg.includes("=")) return arg.split("=").slice(1).join("=").trim();

  const index = args.indexOf(arg);
  return args[index + 1];
}

function parseNumber(name, fallback = null) {
  const raw = parseOption(name);
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function chunk(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

const limit = parseNumber("limit");
const concurrency = parseNumber("concurrency", 6);
const batchSize = parseNumber("batch-size", 120);
const forceAll = args.includes("--force-all");

const additions = await readJson(CATALOG_ADDITIONS_FILE, []);
const targetIndexes = additions
  .map((record, index) => ({ record, index }))
  .filter(({ record }) => {
    const isFika = record?.sourceRefs?.some((entry) => entry?.sourceId === "fika-online-shop");
    if (!isFika) return false;
    return forceAll ? true : needsFikaMetadataEnrichment(record);
  })
  .slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined)
  .map(({ index }) => index);

const result = {
  candidates: targetIndexes.length,
  updated: 0,
  unchanged: 0,
  failed: 0,
  startedAt: new Date().toISOString(),
  completedAt: null,
};

console.log(`Fika metadata enrichment candidates=${result.candidates} concurrency=${concurrency} batchSize=${batchSize}`);

for (const [batchIndex, indexBatch] of chunk(targetIndexes, batchSize).entries()) {
  for (const concurrentIndexes of chunk(indexBatch, concurrency)) {
    const updates = await Promise.all(concurrentIndexes.map(async (index) => {
      const current = additions[index];
      try {
        const enriched = await enrichFikaCatalogRecord(current);
        const changed = JSON.stringify(enriched) !== JSON.stringify(current);
        return { index, enriched, changed, failed: false };
      } catch {
        return { index, enriched: current, changed: false, failed: true };
      }
    }));

    for (const update of updates) {
      if (update.failed) {
        result.failed += 1;
        continue;
      }
      if (update.changed) {
        additions[update.index] = update.enriched;
        result.updated += 1;
      } else {
        result.unchanged += 1;
      }
    }
  }

  await writeJson(CATALOG_ADDITIONS_FILE, additions);
  console.log(`batch ${batchIndex + 1}/${Math.ceil(targetIndexes.length / batchSize)} updated=${result.updated} unchanged=${result.unchanged} failed=${result.failed}`);
}

result.completedAt = new Date().toISOString();
console.log(JSON.stringify(result, null, 2));
