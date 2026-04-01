import { naturalness } from "../../src/lib/naturalness.js";

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function listIncludes(list, values) {
  const haystack = (list ?? []).map(normalize);
  return values.some((value) => haystack.includes(normalize(value)));
}

function textMatch(wine, values) {
  const text = normalize([
    wine.name,
    wine.producer,
    wine.region,
    wine.appellation,
    ...(wine.grapes ?? []),
    ...(wine.styles ?? []),
    ...(wine.flavors ?? []),
  ].join(" "));

  return values.filter((value) => text.includes(normalize(value)));
}

function baseScore(wine) {
  let score = 0;
  if (wine.farming === "biodynamic") score += 8;
  if (wine.farming === "organic") score += 5;
  if (wine.addedSo2 === false) score += 4;
  if (wine.filtration === "none") score += 3;
  if (Number.isFinite(wine.so2) && wine.so2 <= 20) score += 3;
  if (Number.isFinite(wine.price) && wine.price <= 35) score += 1;
  return score;
}

function scoreWine(wine, profile) {
  let score = baseScore(wine);
  const reasons = [];

  if (profile.colors?.length && profile.colors.includes(wine.color)) {
    score += 18;
    reasons.push(`color:${wine.color}`);
  }

  if (profile.countries?.length && profile.countries.includes(wine.country)) {
    score += 12;
    reasons.push(`country:${wine.country}`);
  }

  if (profile.maxPrice && Number.isFinite(wine.price) && wine.price <= Number(profile.maxPrice)) {
    score += 8;
    reasons.push(`within budget`);
  }

  const styles = textMatch(wine, profile.styles ?? []);
  if (styles.length) {
    score += styles.length * 12;
    reasons.push(`style:${styles.join("/")}`);
  }

  const flavors = textMatch(wine, profile.flavors ?? []);
  if (flavors.length) {
    score += flavors.length * 10;
    reasons.push(`flavor:${flavors.join("/")}`);
  }

  const mood = textMatch(wine, profile.mood ? [profile.mood] : []);
  if (mood.length) {
    score += mood.length * 8;
    reasons.push(`mood:${mood.join("/")}`);
  }

  const tags = textMatch(wine, profile.contextTags ?? []);
  if (tags.length) {
    score += tags.length * 11;
    reasons.push(`context:${tags.join("/")}`);
  }

  const naturalnessScore = naturalness(wine);
  if (profile.minNaturalness && naturalnessScore !== null && naturalnessScore >= Number(profile.minNaturalness)) {
    score += 6;
    reasons.push(`naturalness ${naturalnessScore.toFixed(1)}`);
  }

  return {
    wine,
    score,
    reasons,
    naturalness: naturalnessScore,
  };
}

function topResults(records, profile, limit = 6) {
  return records
    .map((record) => scoreWine(record.wine ?? record, profile))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function stockMap(inventory = []) {
  const map = new Map();
  for (const item of inventory) {
    if (!item?.wine?.id) continue;
    const id = item.wine.id;
    const existing = map.get(id) || {
      wineId: id,
      wine: item.wine,
      quantity: 0,
      items: [],
      lastSeenAt: item.matchedAt || item.createdAt || "",
      locations: new Set(),
    };

    const quantity = Number(item.quantity ?? 1) || 1;
    existing.quantity += quantity;
    existing.items.push(item);
    if (item.location) existing.locations.add(item.location);
    if (item.matchedAt || item.createdAt) existing.lastSeenAt = item.matchedAt || item.createdAt;
    map.set(id, existing);
  }

  return new Map([...map.entries()].map(([id, value]) => [
    id,
    {
      ...value,
      locations: [...value.locations],
    },
  ]));
}

function boostByInventory(result, inventoryLookup) {
  const entry = inventoryLookup.get(result.wine.id);
  if (!entry) return result;
  const stockBoost = Math.min(2.5, Math.log2(entry.quantity + 1));

  return {
    ...result,
    score: result.score + stockBoost,
    reasons: [...result.reasons, `stock +${entry.quantity}x`],
    inventoryItem: {
      ...entry,
      quantity: entry.quantity,
      locations: entry.locations,
      inventoryEntries: entry.items.length,
      inventoryItem: entry.items[0],
    },
  };
}

export function buildManualRecommendations({ catalog, inventory, profile }) {
  const inventoryByWine = stockMap(inventory.filter((item) => item?.wine));

  return {
    catalog: topResults(catalog, profile).map((result) => boostByInventory(result, inventoryByWine)),
    inventory: topResults([...inventoryByWine.values()].map((entry) => entry.wine), profile).map((result) => ({
      ...boostByInventory(result, inventoryByWine),
      inventoryItem: inventoryByWine.get(result.wine.id) ?? null,
    })),
  };
}

export function buildContextRecommendations({ catalog, inventory, snapshot, profile }) {
  const inventoryByWine = stockMap(inventory.filter((item) => item?.wine));

  const mergedProfile = {
    ...profile,
    contextTags: snapshot.tags,
  };

  return {
    snapshot,
    catalog: topResults(catalog, mergedProfile).map((result) => boostByInventory(result, inventoryByWine)),
    inventory: topResults([...inventoryByWine.values()].map((entry) => entry.wine), mergedProfile).map((result) => ({
      ...boostByInventory(result, inventoryByWine),
      inventoryItem: inventoryByWine.get(result.wine.id) ?? null,
    })),
  };
}
