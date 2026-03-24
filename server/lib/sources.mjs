import fs from "node:fs/promises";
import path from "node:path";
import { addCatalogRecord, listCatalog } from "./catalog.mjs";
import { DATA_DIR } from "./paths.mjs";
import { makeId, readJson, writeJson, splitCsv } from "./storage.mjs";
import { fileURLToPath } from "node:url";

const SOURCE_WATCHLIST_FILE = path.join(DATA_DIR, "source-watchlist.json");
const MAX_IMPORT_DEFAULT = 240;

const SOURCE_ITEM_KEYS = {
  name: ["name", "wine", "wineName", "product", "product_name", "label", "title"],
  producer: ["producer", "winery", "brand", "producerName", "producer_name", "wineryName"],
  country: ["country", "countryCode", "country_code", "origin", "origin_country", "region_country"],
  region: ["region", "area", "areaName", "regionName", "origin_region"],
  appellation: ["appellation", "subRegion", "appellationName", "designation"],
  grapes: ["grapes", "grape", "varieties", "varietals", "grapeVarieties", "grapeVariety"],
  vintage: ["vintage", "year", "vintageYear", "harvestYear"],
  color: ["color", "styleColor", "hue"],
  so2: ["so2", "so2Total", "sulfurDioxide", "so2TotalMg"],
  farming: ["farming", "farmingMethod", "method", "interventionStyle", "production"],
  intervention: ["intervention", "interventionLevel", "interventionIndex", "interventionScore"],
  skinDays: ["skinDays", "skin_contact_days", "skinContactDays", "skinContact", "contactDays"],
  wholeCluster: ["wholeCluster", "whole_cluster", "wholeClusters", "wholecluster"],
  indigenousYeast: ["indigenousYeast", "indigenous", "wildYeast", "spontaneous"],
  addedSo2: ["addedSo2", "added_so2", "addedSulfur", "sulfurAdded"],
  filtration: ["filtration", "filter", "filtrationType"],
  price: ["price", "retailPrice", "price_eur", "eur"],
  bottleMl: ["bottleMl", "bottle", "volumeMl", "volume_ml", "ml"],
  abv: ["abv", "alcohol", "alcoholVolume"],
  closure: ["closure", "closing", "cork", "stopper"],
  flavors: ["flavors", "flavor", "notes", "tastingNotes", "aroma"],
  styles: ["styles", "style", "styleHints", "wineStyle"],
  aliases: ["aliases", "labelHints", "altNames", "aka", "alsoKnownAs"],
  labelText: ["labelText", "labelHints", "labelHintsText", "labels", "displayName"],
  notes: ["notes", "description", "comment", "commentary", "tasting_note"],
};

const COLOR_ALIAS = {
  blanc: "white",
  white: "white",
  rouge: "red",
  red: "red",
  rose: "rose",
  rosé: "rose",
  rosee: "rose",
  orange: "orange",
  orangewine: "orange",
  amber: "orange",
  amberwine: "orange",
  amber-red: "orange",
  amber_red: "orange",
  unknown: "unknown",
};

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  return splitCsv(value).filter(Boolean);
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  if (["1", "yes", "y", "true", "on", "oui", "ja"].includes(normalized)) return true;
  if (["0", "no", "n", "false", "off", "non", "non."].includes(normalized)) return false;
  if (normalized.startsWith("no ")) return false;
  if (normalized.startsWith("yes ")) return true;
  return null;
}

function normalizeColor(value) {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, "");

  if (!normalized) return "unknown";
  return COLOR_ALIAS[normalized] || "unknown";
}

function normalizeFarming(value) {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, "-");

  if (!normalized) return "unknown";
  if (["organic", "biodynamic", "natural", "zero-intervention", "low-intervention", "conventional", "unknown"].includes(normalized)) {
    return normalized;
  }
  return "unknown";
}

function pickValue(item, key, source) {
  const map = source?.fieldMap?.[key];
  const candidateKeys = Array.isArray(map) ? map : map ? [map] : SOURCE_ITEM_KEYS[key];
  for (const candidateKey of candidateKeys ?? []) {
    const hit = item?.[candidateKey];
    if (hit !== undefined && hit !== null && hit !== "") return hit;
  }
  return null;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.replace(/^"|"$/g, "").trim());
}

function parseCsvText(text) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const header = parseCsvLine(lines[0]);
  const output = [];

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    const values = parseCsvLine(line);
    const item = {};
    header.forEach((key, headerIndex) => {
      item[key] = values[headerIndex] ?? "";
    });
    output.push(item);
  }

  return output;
}

function parseJsonPayload(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.wines)) return raw.wines;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.results)) return raw.results;
  return [];
}

function parseSourceText(text, source) {
  const mode = normalizeText(source.format).toLowerCase();
  if (mode === "csv") return parseCsvText(text);
  if (mode === "json") {
    try {
      return parseJsonPayload(JSON.parse(text));
    } catch {
      return [];
    }
  }

  const trimmed = normalizeText(text);
  if (trimmed.startsWith("[")) {
    try {
      return parseJsonPayload(JSON.parse(trimmed));
    } catch {
      return parseCsvText(text);
    }
  }

  const semicolonClean = trimmed.replace(/;\s*$/, "");
  try {
    return parseJsonPayload(JSON.parse(semicolonClean));
  } catch {
    return parseCsvText(text);
  }
}

async function readSourceText(endpoint) {
  const normalized = normalizeText(endpoint);

  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    const response = await fetch(normalized);
    if (!response.ok) {
      throw new Error(`Source fetch failed: ${response.status}`);
    }
    return response.text();
  }

  const resolved = normalized.startsWith("file://")
    ? fileURLToPath(normalized)
    : path.resolve(process.cwd(), normalized);

  return fs.readFile(resolved, "utf8");
}

function recordKey(record) {
  const name = normalizeText(record.name).toLowerCase();
  const producer = normalizeText(record.producer).toLowerCase();
  return `${name}|${producer}`;
}

function normalizeRecord(rawItem, source, endpoint) {
  const name = normalizeText(pickValue(rawItem, "name", source));
  const producer = normalizeText(pickValue(rawItem, "producer", source));

  if (!name || !producer) {
    return null;
  }

  const notesText = normalizeText(pickValue(rawItem, "notes", source));
  const descriptionText = normalizeText(pickValue(rawItem, "description", source));

  const candidate = {
    name,
    producer,
    country: normalizeText(pickValue(rawItem, "country", source)) || "UNKNOWN",
    region: normalizeText(pickValue(rawItem, "region", source)) || "Unknown",
    appellation: normalizeText(pickValue(rawItem, "appellation", source)) || null,
    grapes: normalizeArray(pickValue(rawItem, "grapes", source)),
    vintage: normalizeNumber(pickValue(rawItem, "vintage", source)),
    color: normalizeColor(pickValue(rawItem, "color", source)),
    so2: normalizeNumber(pickValue(rawItem, "so2", source)),
    farming: normalizeFarming(pickValue(rawItem, "farming", source)),
    intervention: normalizeNumber(pickValue(rawItem, "intervention", source)),
    skinDays: normalizeNumber(pickValue(rawItem, "skinDays", source)),
    wholeCluster: normalizeNumber(pickValue(rawItem, "wholeCluster", source)),
    indigenousYeast: normalizeBoolean(pickValue(rawItem, "indigenousYeast", source)),
    addedSo2: normalizeBoolean(pickValue(rawItem, "addedSo2", source)),
    filtration: normalizeText(pickValue(rawItem, "filtration", source)) || "unknown",
    price: normalizeNumber(pickValue(rawItem, "price", source)),
    bottleMl: normalizeNumber(pickValue(rawItem, "bottleMl", source)),
    abv: normalizeNumber(pickValue(rawItem, "abv", source)),
    closure: normalizeText(pickValue(rawItem, "closure", source)) || null,
    flavors: normalizeArray(pickValue(rawItem, "flavors", source)),
    styles: normalizeArray(pickValue(rawItem, "styles", source)),
    aliases: normalizeArray(pickValue(rawItem, "aliases", source)),
    labelText: normalizeArray(pickValue(rawItem, "labelText", source)),
    notes: `${notesText}${descriptionText ? ` / ${descriptionText}` : ""}`,
    sourceRefs: [
      {
        sourceId: source.id,
        sourceLabel: source.label,
        sourceType: source.type,
        sourceUrl: endpoint,
      },
    ],
    createdAt: new Date().toISOString(),
  };

  candidate.notes = normalizeText(candidate.notes);
  return candidate;
}

function touchSource(sources, sourceId, updates) {
  const nextSources = sources.map((source) => (source.id === sourceId ? { ...source, ...updates } : source));
  if (nextSources.length === sources.length) return [nextSources, nextSources.find((source) => source.id === sourceId)];
  return [nextSources, null];
}

export async function listSources() {
  return readJson(SOURCE_WATCHLIST_FILE, []);
}

export async function getSourceById(sourceId) {
  const sources = await listSources();
  return sources.find((source) => source.id === sourceId) ?? null;
}

export async function updateSource(sourceId, updates) {
  const sources = await listSources();
  const updatedAt = new Date().toISOString();
  const [nextSources, updated] = touchSource(sources, sourceId, { ...updates, updatedAt });
  if (!updated) {
    throw new Error(`source ${sourceId} is not found`);
  }

  await writeJson(SOURCE_WATCHLIST_FILE, nextSources);
  return updated;
}

export async function runSourceCollection(sourceId, options = {}) {
  const source = await getSourceById(sourceId);
  if (!source) {
    throw new Error(`Unknown source id: ${sourceId}`);
  }

  if (source.enabled === false && !options.force) {
    throw new Error(`Source "${source.label}" is disabled`);
  }

  const endpoint = normalizeText(options.endpoint || source.endpoint);
  if (!endpoint) {
    throw new Error(`No endpoint configured for source "${source.label}"`);
  }

  await updateSource(sourceId, { status: "running", lastError: "", lastResult: null });
  const startedAt = new Date().toISOString();
  const existing = await listCatalog();
  const knownKeys = new Set(existing.map(recordKey));

  let payloadText = "";
  try {
    payloadText = await readSourceText(endpoint);
  } catch (error) {
    const nextError = error instanceof Error ? error.message : "source read failed";
    await updateSource(sourceId, { status: "error", lastError: nextError, lastRunAt: startedAt });
    throw error;
  }

  const items = parseSourceText(await payloadText, source);
  const max = Number.isFinite(options.limit) && options.limit > 0
    ? options.limit
    : Number.isFinite(source.limit) && source.limit > 0
      ? source.limit
      : MAX_IMPORT_DEFAULT;

  const targetItems = items.slice(0, max);
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const item of targetItems) {
    const candidate = normalizeRecord(item, source, endpoint);
    if (!candidate) {
      skipped += 1;
      continue;
    }

    const key = recordKey(candidate);
    if (knownKeys.has(key)) {
      skipped += 1;
      continue;
    }

    try {
      await addCatalogRecord(candidate);
      knownKeys.add(key);
      imported += 1;
    } catch (error) {
      skipped += 1;
      errors.push({
        id: item.id ?? makeId("item"),
        name: candidate.name,
        message: error instanceof Error ? error.message : "failed to register item",
      });
    }
  }

  const result = {
    sourceId: source.id,
    sourceLabel: source.label,
    endpoint,
    startedAt,
    completedAt: new Date().toISOString(),
    imported,
    skipped,
    candidates: targetItems.length,
    errors,
  };

  await updateSource(sourceId, {
    status: "ok",
    lastRunAt: result.completedAt,
    lastError: errors.length ? "partial-fail" : "",
    lastResult: result,
    lastEndpoint: endpoint,
  });

  return result;
}

export async function runAllSources(options = {}) {
  const sources = await listSources();
  const selected = options.sourceIds ?? sources.filter((source) => source.enabled !== false).map((source) => source.id);
  const results = [];

  for (const sourceId of selected) {
    try {
      results.push(await runSourceCollection(sourceId, {
        limit: options.limit,
        force: options.force,
      }));
    } catch (error) {
      results.push({
        sourceId,
        status: "error",
        error: error instanceof Error ? error.message : "collection failed",
        completedAt: new Date().toISOString(),
      });
      try {
        await updateSource(sourceId, {
          status: "error",
          lastError: error instanceof Error ? error.message : "collection failed",
        });
      } catch {
        // Ignore when source was manually removed between runs.
      }
    }
  }

  return results;
}
