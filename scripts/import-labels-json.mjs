import fs from "node:fs/promises";
import path from "node:path";
import { addLabelRecord } from "../server/lib/labels.mjs";

const input = process.argv[2];

if (!input) {
  console.error("Usage: npm run import:labels -- /absolute/or/relative/path/to/labels.json");
  process.exit(1);
}

const absolutePath = path.resolve(process.cwd(), input);
const raw = await fs.readFile(absolutePath, "utf8");
const records = JSON.parse(raw);

if (!Array.isArray(records)) {
  console.error("Expected a JSON array of label records.");
  process.exit(1);
}

let imported = 0;

for (const record of records) {
  if (!record.catalogWineId) {
    console.warn(`Skipping invalid label record: ${JSON.stringify(record)}`);
    continue;
  }

  await addLabelRecord(record);
  imported += 1;
}

console.log(`Imported ${imported} label records from ${absolutePath}`);
