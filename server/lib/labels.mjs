import path from "node:path";
import { DATA_DIR } from "./paths.mjs";
import { makeId, readJson, splitCsv, writeJson } from "./storage.mjs";

const LABELS_FILE = path.join(DATA_DIR, "labels.json");

export async function listLabels() {
  return readJson(LABELS_FILE, []);
}

export async function addLabelRecord(payload) {
  const labels = await readJson(LABELS_FILE, []);
  const record = {
    id: makeId("label"),
    catalogWineId: payload.catalogWineId,
    imagePath: payload.imagePath || "",
    originalName: payload.originalName || "",
    displayName: payload.displayName || "",
    ocrText: payload.ocrText || "",
    extractedKeywords: Array.isArray(payload.extractedKeywords) ? payload.extractedKeywords : splitCsv(payload.extractedKeywords),
    dominantColors: Array.isArray(payload.dominantColors) ? payload.dominantColors : splitCsv(payload.dominantColors),
    motifs: Array.isArray(payload.motifs) ? payload.motifs : splitCsv(payload.motifs),
    typography: payload.typography || "",
    badgeText: payload.badgeText || "",
    notes: payload.notes || "",
    source: payload.source || "upload",
    createdAt: new Date().toISOString(),
  };

  labels.unshift(record);
  await writeJson(LABELS_FILE, labels);
  return record;
}
