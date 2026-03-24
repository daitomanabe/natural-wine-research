import path from "node:path";
import { DATA_DIR } from "./paths.mjs";
import { makeId, readJson, writeJson } from "./storage.mjs";

const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");

export async function listInventory() {
  return readJson(INVENTORY_FILE, []);
}

export async function addInventoryItem(payload) {
  const inventory = await readJson(INVENTORY_FILE, []);
  const record = {
    id: makeId("inventory"),
    catalogWineId: payload.catalogWineId || null,
    customLabel: payload.customLabel || "",
    quantity: payload.quantity ? Number(payload.quantity) : 1,
    location: payload.location || "",
    notes: payload.notes || "",
    imagePath: payload.imagePath || "",
    ocrText: payload.ocrText || "",
    confidence: payload.confidence || "unmatched",
    matchedAt: new Date().toISOString(),
  };

  inventory.unshift(record);
  await writeJson(INVENTORY_FILE, inventory);
  return record;
}

export function materializeInventory(inventory, catalogMap) {
  return inventory.map((item) => ({
    ...item,
    wine: item.catalogWineId ? catalogMap.get(item.catalogWineId) ?? null : null,
  }));
}
