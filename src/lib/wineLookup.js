function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value) {
  const stopWords = new Set(["de", "du", "la", "le", "les", "and", "the", "vin", "wine", "sur", "lie"]);

  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function distinct(values) {
  return [...new Set(values.filter(Boolean))];
}

function fieldText(value) {
  if (Array.isArray(value)) {
    return value.join(" ");
  }

  return String(value ?? "");
}

function buildWineFields(wine) {
  return [
    { label: "name", weight: 6, value: wine.name },
    { label: "producer", weight: 7, value: wine.producer },
    { label: "appellation", weight: 3, value: wine.appellation },
    { label: "region", weight: 2, value: wine.region },
    { label: "grapes", weight: 2, value: wine.grapes },
    { label: "styles", weight: 2, value: wine.styles },
    { label: "aliases", weight: 8, value: wine.aliases },
    { label: "labelText", weight: 9, value: wine.labelText },
  ];
}

function matchField(queryTokens, field) {
  const normalizedField = normalizeText(fieldText(field.value));
  const fieldTokens = tokenize(field.value);
  const matched = distinct(queryTokens.filter((token) => (
    fieldTokens.includes(token) || (token.length >= 4 && normalizedField.includes(token))
  )));

  return {
    score: matched.length * field.weight,
    matched,
  };
}

export function matchWinesByText(query, wines) {
  const queryTokens = tokenize(query);
  const normalizedQuery = normalizeText(query);

  if (!queryTokens.length) {
    return [];
  }

  return wines
    .map((wine) => {
      const fieldMatches = buildWineFields(wine).map((field) => matchField(queryTokens, field));
      const matchedTerms = distinct(fieldMatches.flatMap((match) => match.matched));
      let score = fieldMatches.reduce((sum, match) => sum + match.score, 0);

      if ((wine.aliases ?? []).some((alias) => normalizedQuery.includes(normalizeText(alias)))) {
        score += 20;
      }

      if (normalizedQuery.includes(normalizeText(wine.producer))) {
        score += 14;
      }

      if (normalizedQuery.includes(normalizeText(wine.name))) {
        score += 18;
      }

      const coverage = matchedTerms.length / queryTokens.length;
      const confidence =
        score >= 36 || coverage >= 0.75 ? "high"
          : score >= 20 || coverage >= 0.45 ? "medium"
            : "low";

      return {
        wine,
        score,
        coverage,
        confidence,
        matchedTerms,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage);
}
