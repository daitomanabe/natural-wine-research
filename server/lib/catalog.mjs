import path from "node:path";
import { DB } from "../../src/data/wines.js";
import { listLabels } from "./labels.mjs";
import { DATA_DIR } from "./paths.mjs";
import { makeId, readJson, splitCsv, writeJson } from "./storage.mjs";

const CATALOG_ADDITIONS_FILE = path.join(DATA_DIR, "catalog-additions.json");
const SOURCE_WATCHLIST_FILE = path.join(DATA_DIR, "source-watchlist.json");

function distinct(values) {
  return [...new Set(values.filter(Boolean))];
}

function enrichWine(wine, source = "seed", labels = []) {
  const labelKeywords = labels.flatMap((label) => [
    ...(label.extractedKeywords ?? []),
    ...(label.dominantColors ?? []),
    ...(label.motifs ?? []),
    label.typography,
    label.badgeText,
    label.displayName,
  ]);

  return {
    ...wine,
    styles: wine.styles ?? [],
    flavors: wine.flavors ?? [],
    grapes: wine.grapes ?? [],
    aliases: distinct([...(wine.aliases ?? []), ...labels.map((label) => label.displayName)]),
    labelText: distinct([...(wine.labelText ?? []), ...labelKeywords]),
    labels,
    source,
  };
}

export async function listCatalog() {
  const labels = await listLabels();
  const additions = await readJson(CATALOG_ADDITIONS_FILE, []);
  const labelsByWineId = new Map();

  for (const label of labels) {
    const list = labelsByWineId.get(label.catalogWineId) ?? [];
    list.push(label);
    labelsByWineId.set(label.catalogWineId, list);
  }

  return [
    ...DB.map((wine) => enrichWine(wine, "seed", labelsByWineId.get(wine.id) ?? [])),
    ...additions.map((wine) => enrichWine(wine, "custom", labelsByWineId.get(wine.id) ?? [])),
  ];
}

export async function listSourceWatchlist() {
  return readJson(SOURCE_WATCHLIST_FILE, []);
}

export async function addCatalogRecord(payload) {
  const additions = await readJson(CATALOG_ADDITIONS_FILE, []);

  const record = enrichWine({
    id: payload.id ?? makeId("catalog"),
    name: payload.name,
    producer: payload.producer,
    country: payload.country || "UNKNOWN",
    region: payload.region || "Unknown",
    appellation: payload.appellation || null,
    grapes: Array.isArray(payload.grapes) ? payload.grapes : splitCsv(payload.grapes),
    vintage: payload.vintage === "" ? null : payload.vintage ?? null,
    color: payload.color || "white",
    so2: payload.so2 === "" || payload.so2 === undefined ? null : Number(payload.so2),
    farming: payload.farming || "unknown",
    intervention: payload.intervention === "" || payload.intervention === undefined ? null : Number(payload.intervention),
    skinDays: payload.skinDays === "" || payload.skinDays === undefined ? null : Number(payload.skinDays),
    wholeCluster: payload.wholeCluster === "" || payload.wholeCluster === undefined ? null : Number(payload.wholeCluster),
    indigenousYeast: payload.indigenousYeast ?? null,
    addedSo2: payload.addedSo2 ?? null,
    filtration: payload.filtration || "unknown",
    price: payload.price === "" || payload.price === undefined ? null : Number(payload.price),
    bottleMl: payload.bottleMl === "" || payload.bottleMl === undefined ? null : Number(payload.bottleMl),
    abv: payload.abv === "" || payload.abv === undefined ? null : Number(payload.abv),
    closure: payload.closure || null,
    flavors: Array.isArray(payload.flavors) ? payload.flavors : splitCsv(payload.flavors),
    styles: Array.isArray(payload.styles) ? payload.styles : splitCsv(payload.styles),
    aliases: Array.isArray(payload.aliases) ? payload.aliases : splitCsv(payload.aliases),
    labelText: Array.isArray(payload.labelText) ? payload.labelText : splitCsv(payload.labelText),
    notes: payload.notes || "",
    sourceRefs: payload.sourceRefs ?? [],
    createdAt: new Date().toISOString(),
  }, "custom");

  additions.unshift(record);
  await writeJson(CATALOG_ADDITIONS_FILE, additions);

  return record;
}

export function mapCatalogById(catalog) {
  return new Map(catalog.map((wine) => [wine.id, wine]));
}

export function buildCatalogStats(catalog, inventory, labels) {
  const inventoryLinked = inventory.filter((item) => item.catalogWineId).length;
  const plottable = catalog.filter((wine) => Number.isFinite(wine.so2) && Number.isFinite(wine.intervention)).length;
  const labelReady = catalog.filter((wine) => wine.aliases.length || wine.labelText.length).length;

  return {
    catalogCount: catalog.length,
    inventoryCount: inventory.length,
    inventoryLinked,
    plottable,
    labelReady,
    labelAssets: labels.length,
    countries: [...new Set(catalog.map((wine) => wine.country))].length,
  };
}
