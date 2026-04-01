import path from "node:path";
import { DATA_DIR } from "./paths.mjs";
import { makeId, readJson, writeJson } from "./storage.mjs";

const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");

function normalizeInventoryRecord(payload) {
  const notes = String(payload.notes ?? "").trim();
  const customLabel = String(payload.customLabel ?? payload.label ?? "").trim();
  const location = String(payload.location ?? "").trim();
  const ocrText = String(payload.ocrText ?? "").trim();
  const quantity = Number(payload.quantity);
  const catalogWineId = payload.catalogWineId ? String(payload.catalogWineId) : null;
  const confidence = String(payload.confidence ?? "unmatched");

  return {
    id: payload.id || makeId("inventory"),
    catalogWineId,
    customLabel,
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1,
    location,
    notes,
    imagePath: String(payload.imagePath ?? ""),
    ocrText,
    confidence,
    matchedAt: payload.matchedAt || new Date().toISOString(),
  };
}

export async function listInventory() {
  return readJson(INVENTORY_FILE, []);
}

export async function addInventoryItem(payload) {
  const inventory = await readJson(INVENTORY_FILE, []);
  const record = normalizeInventoryRecord(payload);

  inventory.unshift(record);
  await writeJson(INVENTORY_FILE, inventory);
  return record;
}

export async function addInventoryItems(payloads = []) {
  const inventory = await readJson(INVENTORY_FILE, []);
  const created = [];

  for (const payload of payloads) {
    if (!payload) continue;
    const record = normalizeInventoryRecord(payload);
    inventory.unshift(record);
    created.push(record);
  }

  if (created.length) {
    await writeJson(INVENTORY_FILE, inventory);
  }

  return created;
}

export function materializeInventory(inventory, catalogMap) {
  return inventory.map((item) => ({
    ...item,
    wine: item.catalogWineId ? catalogMap.get(item.catalogWineId) ?? null : null,
  }));
}

export function summarizeInventory(inventory = []) {
  const byLocation = new Map();
  const byWine = new Map();
  let totalQuantity = 0;
  let linkedCount = 0;

  for (const item of inventory) {
    const quantity = Number(item.quantity ?? 1) || 1;
    totalQuantity += quantity;
    const loc = String(item.location || "Unknown").trim();
    byLocation.set(loc, (byLocation.get(loc) || 0) + quantity);
    if (item.catalogWineId) {
      linkedCount += 1;
    }
  }

  for (const item of inventory) {
    if (!item.catalogWineId) continue;

    const wineId = item.catalogWineId;
    const existing = byWine.get(wineId) || {
      wineId,
      entries: 0,
      quantity: 0,
      lastSeenAt: item.matchedAt || item.createdAt || "",
      locations: new Set(),
    };
    const quantity = Number(item.quantity ?? 1) || 1;

    existing.entries += 1;
    existing.quantity += quantity;
    if (item.matchedAt || item.createdAt) {
      existing.lastSeenAt = item.matchedAt || item.createdAt;
    }
    existing.locations.add(String(item.location || "Unknown").trim() || "Unknown");
    byWine.set(wineId, existing);
  }

  return {
    totalQuantity,
    linkedCount,
    uniqueWineCount: byWine.size,
    byLocation: [...byLocation.entries()].sort((a, b) => b[1] - a[1]),
    byWine: [...byWine.values()].map((entry) => ({
      ...entry,
      locations: [...entry.locations],
    })),
  };
}
