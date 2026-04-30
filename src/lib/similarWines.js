import { COLOR_MAP, FARMING_MAP } from "../data/wines.js";
import { naturalness } from "./naturalness.js";

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeValues(values) {
  const stopWords = new Set([
    "and",
    "the",
    "vin",
    "vino",
    "wine",
    "de",
    "la",
    "le",
    "les",
    "sur",
    "lie",
    "main",
    "other",
  ]);

  return [...new Set(
    String(values ?? "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !stopWords.has(token))
  )];
}

function tokensFromList(list = []) {
  return tokenizeValues(
    (list ?? [])
      .map((value) => normalizeText(value))
      .join(" ")
  );
}

function overlap(targetValues, candidateValues) {
  const targetTokens = tokensFromList(targetValues);
  const candidateTokens = tokensFromList(candidateValues);
  return targetTokens.filter((token) => candidateTokens.includes(token));
}

function uniqueReasons(reasons) {
  return [...new Set(reasons.filter(Boolean))];
}

function formatPriceReason(deltaRatio) {
  if (deltaRatio <= 0.1) return "price near target";
  if (deltaRatio <= 0.2) return "price close";
  if (deltaRatio <= 0.35) return "price adjacent";
  return null;
}

function colorLabel(color) {
  return COLOR_MAP[color]?.label ?? color ?? "unknown";
}

function farmingLabel(farming) {
  return FARMING_MAP[farming]?.label ?? farming ?? "unknown";
}

export function scoreSimilarWine(target, candidate) {
  if (!target || !candidate || target.id === candidate.id) return null;

  let score = 0;
  const reasons = [];
  const grapeMatches = overlap(target.grapes, candidate.grapes);
  const styleMatches = overlap(
    [...(target.styles ?? []), ...(target.flavors ?? [])],
    [...(candidate.styles ?? []), ...(candidate.flavors ?? [])]
  );

  if (target.color && candidate.color && target.color === candidate.color) {
    score += 22;
    reasons.push(`${colorLabel(candidate.color)} profile`);
  }

  if (target.country && candidate.country && target.country === candidate.country) {
    score += 14;
    reasons.push(target.country);
  }

  if (target.region && candidate.region && target.region === candidate.region && target.region !== "Unknown") {
    score += 16;
    reasons.push(`region ${candidate.region}`);
  }

  if (target.producer && candidate.producer && target.producer === candidate.producer) {
    score += 10;
    reasons.push("same producer");
  }

  if (grapeMatches.length) {
    score += Math.min(24, grapeMatches.length * 8);
    reasons.push(`grapes ${grapeMatches.slice(0, 3).join("/")}`);
  }

  if (styleMatches.length) {
    score += Math.min(10, styleMatches.length * 5);
    reasons.push(`style ${styleMatches.slice(0, 2).join("/")}`);
  }

  if (Number.isFinite(target.price) && Number.isFinite(candidate.price)) {
    const deltaRatio = Math.abs(candidate.price - target.price) / Math.max(target.price, 1);
    if (deltaRatio <= 0.1) score += 10;
    else if (deltaRatio <= 0.2) score += 7;
    else if (deltaRatio <= 0.35) score += 4;

    const priceReason = formatPriceReason(deltaRatio);
    if (priceReason) reasons.push(priceReason);
  }

  if (Number.isFinite(target.vintage) && Number.isFinite(candidate.vintage)) {
    const diff = Math.abs(candidate.vintage - target.vintage);
    if (diff === 0) {
      score += 6;
      reasons.push(`same vintage ${candidate.vintage}`);
    } else if (diff === 1) {
      score += 4;
      reasons.push("near vintage");
    } else if (diff === 2) {
      score += 2;
    }
  }

  if (target.farming && candidate.farming && target.farming === candidate.farming && target.farming !== "unknown") {
    score += 6;
    reasons.push(farmingLabel(candidate.farming));
  }

  if (target.filtration && candidate.filtration && target.filtration === candidate.filtration && target.filtration !== "unknown") {
    score += 3;
    reasons.push(`filtration ${candidate.filtration}`);
  }

  if (target.addedSo2 === false && candidate.addedSo2 === false) {
    score += 4;
    reasons.push("no added SO2");
  }

  const targetNaturalness = naturalness(target);
  const candidateNaturalness = naturalness(candidate);
  if (targetNaturalness !== null && candidateNaturalness !== null) {
    const diff = Math.abs(candidateNaturalness - targetNaturalness);
    const naturalnessScore = Math.max(0, 6 - diff * 2);
    score += naturalnessScore;
    if (naturalnessScore >= 3) reasons.push("naturalness close");
  }

  return {
    wine: candidate,
    score: Number(score.toFixed(1)),
    reasons: uniqueReasons(reasons),
    metrics: {
      grapeOverlap: grapeMatches.length,
      styleOverlap: styleMatches.length,
      priceDelta: Number.isFinite(target.price) && Number.isFinite(candidate.price)
        ? candidate.price - target.price
        : null,
      vintageDelta: Number.isFinite(target.vintage) && Number.isFinite(candidate.vintage)
        ? candidate.vintage - target.vintage
        : null,
      producerMatch: target.producer === candidate.producer,
      regionMatch: target.region === candidate.region,
      countryMatch: target.country === candidate.country,
      colorMatch: target.color === candidate.color,
      targetNaturalness,
      candidateNaturalness,
    },
  };
}

export function findSimilarWines(target, catalog, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : 10;

  return (catalog ?? [])
    .map((candidate) => scoreSimilarWine(target, candidate))
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if ((right.metrics.grapeOverlap ?? 0) !== (left.metrics.grapeOverlap ?? 0)) {
        return (right.metrics.grapeOverlap ?? 0) - (left.metrics.grapeOverlap ?? 0);
      }
      return String(left.wine.name).localeCompare(String(right.wine.name), "ja");
    })
    .slice(0, limit);
}
