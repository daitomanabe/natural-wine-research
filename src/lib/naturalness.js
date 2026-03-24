export function naturalness(wine) {
  if (!Number.isFinite(wine.so2) || !Number.isFinite(wine.intervention)) {
    return null;
  }

  let score = 10;

  score -= wine.intervention * 2;
  score -= wine.so2 / 9;

  if (!wine.indigenousYeast) score -= 1;
  if (wine.filtration === "filtered") score -= 1;
  if (wine.filtration === "light") score -= 0.5;
  if (wine.addedSo2) score -= 0.5;

  return Math.max(0, Math.min(10, score));
}
