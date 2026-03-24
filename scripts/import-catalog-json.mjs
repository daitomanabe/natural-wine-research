import fs from "node:fs/promises";
import path from "node:path";
import { addCatalogRecord } from "../server/lib/catalog.mjs";

const input = process.argv[2];

if (!input) {
  console.error("Usage: npm run import:catalog -- /absolute/or/relative/path/to/wines.json");
  process.exit(1);
}

const absolutePath = path.resolve(process.cwd(), input);
const raw = await fs.readFile(absolutePath, "utf8");
const records = JSON.parse(raw);

if (!Array.isArray(records)) {
  console.error("Expected a JSON array of wine records.");
  process.exit(1);
}

let imported = 0;

for (const record of records) {
  if (!record.name || !record.producer) {
    console.warn(`Skipping invalid record: ${JSON.stringify(record)}`);
    continue;
  }

  await addCatalogRecord(record);
  imported += 1;
}

console.log(`Imported ${imported} records from ${absolutePath}`);
