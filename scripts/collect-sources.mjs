import { listSources, runAllSources, runSourceCollection } from "../server/lib/sources.mjs";

const args = process.argv.slice(2);

function parseOption(name, fallback = null) {
  const arg = args.find((item, index) => {
    if (!item.startsWith(`--${name}=`)) return false;
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

const target = args.find((item) => !item.startsWith("--"));
const sourceId = target ?? null;
const force = args.includes("--force");
const limit = parseNumber("limit");

if (!sourceId) {
  const results = await runAllSources({ force, limit });
  const ok = results.filter((entry) => entry.status !== "error").length;
  const err = results.length - ok;
  console.log(`Collected ${results.length} sources. ok=${ok}, error=${err}`);
  for (const result of results) {
    if (result.status === "error") {
      console.log(`${result.sourceId}: ${result.error}`);
      continue;
    }
    console.log(`${result.sourceId}: imported=${result.imported}, skipped=${result.skipped}, candidates=${result.candidates}`);
  }
  process.exit(err > 0 ? 1 : 0);
}

const result = await runSourceCollection(sourceId, { force, limit });
console.log(`Collected ${sourceId}:`, result);
