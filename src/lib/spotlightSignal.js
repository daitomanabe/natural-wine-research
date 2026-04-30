import { COLOR_MAP, FARMING_MAP, FLAG_MAP } from "../data/wines.js";
import { naturalness } from "./naturalness.js";

export const SPOTLIGHT_WINE_MATCH = {
  name: "ミルー 2023",
  producer: "コル・タマリエ",
};

const COLOR_THEMES = {
  white: {
    palette: {
      background: "#f3ebdd",
      surface: "#dccfb2",
      accent: "#8db8b1",
      highlight: "#a6af7a",
      anchor: "#14202a",
    },
    moodTags: ["lifted", "precise", "daylight"],
    atmosphere: ["clean mineral glow", "quiet counter energy"],
    setting: "cool aperitivo hour with open windows",
    lighting: "chalk ivory, sea-glass teal, and olive-shadow edges",
    materials: ["limestone", "linen", "frosted glass"],
    motion: "slow lateral drift",
    music: {
      genres: ["balearic dub", "ambient jazz", "minimal house"],
      bpm: 104,
      energy: 46,
      danceability: 48,
      textures: ["airy", "transparent", "saline"],
      instruments: ["electric piano", "soft percussion", "upright bass"],
    },
  },
  red: {
    palette: {
      background: "#241619",
      surface: "#613030",
      accent: "#b94843",
      highlight: "#d49a72",
      anchor: "#0d1116",
    },
    moodTags: ["grounded", "vinyl-warm", "slow-burn"],
    atmosphere: ["garnet low light", "deep table conversation"],
    setting: "late-night service with weight and warmth",
    lighting: "garnet glow, umber spill, and smoked-black edges",
    materials: ["dark wood", "smoked glass", "heavy linen"],
    motion: "measured sway",
    music: {
      genres: ["dub", "cosmic jazz", "slow house"],
      bpm: 96,
      energy: 58,
      danceability: 52,
      textures: ["grainy", "earthy", "low-end"],
      instruments: ["double bass", "tape echo", "muted trumpet"],
    },
  },
  orange: {
    palette: {
      background: "#281b16",
      surface: "#7f4f36",
      accent: "#cb7a3d",
      highlight: "#ddb466",
      anchor: "#13181d",
    },
    moodTags: ["textural", "sun-faded", "ritual"],
    atmosphere: ["amber air", "long-transition table"],
    setting: "shared plates, extended pours, and a room that lingers",
    lighting: "amber wash, copper edge, and charcoal depth",
    materials: ["ceramic", "oxidized metal", "raw timber"],
    motion: "slow spiral",
    music: {
      genres: ["leftfield downtempo", "dub techno", "psychedelic folk"],
      bpm: 100,
      energy: 56,
      danceability: 46,
      textures: ["grain", "skin-contact tannin", "heat haze"],
      instruments: ["frame drum", "analog synth", "nylon guitar"],
    },
  },
  "rosé": {
    palette: {
      background: "#2a1c24",
      surface: "#7d485f",
      accent: "#dd8fa0",
      highlight: "#f0c7b7",
      anchor: "#13161d",
    },
    moodTags: ["rosy dusk", "bright", "social"],
    atmosphere: ["summer neon haze", "soft surface sparkle"],
    setting: "sunset terrace with a loose first set",
    lighting: "rose cloud, peach spill, and blue-hour depth",
    materials: ["gloss ceramic", "thin linen", "clear ice"],
    motion: "quick shoulder sway",
    music: {
      genres: ["dream pop", "nu-disco", "lo-fi house"],
      bpm: 116,
      energy: 64,
      danceability: 67,
      textures: ["bright", "silky", "breezy"],
      instruments: ["synth pads", "clean guitar", "tight drum machine"],
    },
  },
  "pétillant": {
    palette: {
      background: "#132028",
      surface: "#32525b",
      accent: "#7eb8b0",
      highlight: "#d7c9a0",
      anchor: "#081015",
    },
    moodTags: ["effervescent", "kinetic", "casual"],
    atmosphere: ["small-bubble electricity", "glass-clink momentum"],
    setting: "high-turnover opening hour with quick resets",
    lighting: "mint flare, straw highlights, and dark bottle contrast",
    materials: ["cold steel", "clear glass", "cork fragments"],
    motion: "quick pulse",
    music: {
      genres: ["boogie", "broken beat", "house"],
      bpm: 120,
      energy: 74,
      danceability: 76,
      textures: ["spark", "lift", "snap"],
      instruments: ["clavinet", "hand percussion", "rubber bass"],
    },
  },
};

const COUNTRY_PRESETS = [
  {
    key: "italy",
    matches: ["it", "italy", "italia", "イタリア"],
    moodTags: ["Mediterranean", "convivial"],
    atmosphere: ["aperitivo dusk", "warm ceramic surfaces"],
    genres: ["Mediterranean jazz", "balearic"],
    palette: { highlight: "#b6a06d" },
    materials: ["ceramic", "stone"],
  },
  {
    key: "france",
    matches: ["fr", "france", "フランス"],
    moodTags: ["bistro-lit", "composed"],
    atmosphere: ["after-service candle edge", "quiet city pressure"],
    genres: ["minimal jazz", "leftfield lounge"],
    palette: { surface: "#cdbb9f" },
    materials: ["oak", "glass"],
  },
  {
    key: "alpine",
    matches: ["at", "austria", "de", "germany", "si", "slovenia", "オーストリア", "ドイツ", "スロベニア"],
    moodTags: ["alpine", "cool-air"],
    atmosphere: ["high-altitude clarity", "stone-floor precision"],
    genres: ["microhouse", "ambient techno"],
    palette: { accent: "#85a8c0" },
    materials: ["stone", "steel"],
  },
  {
    key: "iberia",
    matches: ["es", "spain", "pt", "portugal", "スペイン", "ポルトガル"],
    moodTags: ["dry heat", "sunset dust"],
    atmosphere: ["terrace warmth", "guitar-string tension"],
    genres: ["balearic house", "guitar dub"],
    palette: { highlight: "#c58a54" },
    materials: ["terracotta", "linen"],
  },
  {
    key: "wide-open",
    matches: ["us", "united states", "au", "australia", "za", "south africa", "mx", "mexico", "アメリカ", "オーストラリア", "南アフリカ", "メキシコ"],
    moodTags: ["open-air", "indie"],
    atmosphere: ["warehouse ease", "wide-room breathing space"],
    genres: ["indie leftfield", "downtempo house"],
    palette: { anchor: "#182029" },
    materials: ["concrete", "matte glass"],
  },
];

const MODIFIERS = [
  {
    key: "mineral",
    matches: ["saline", "mineral", "flint", "stone", "stony", "marine", "chalk", "clay", "gneiss", "opok", "sea", "salt", "塩", "海", "石", "ミネラル"],
    moodTags: ["mineral", "coastal"],
    atmosphere: ["sea-glass chill", "stony restraint"],
    genres: ["ambient dub", "deep minimal"],
    bpm: -2,
    energy: -2,
    palette: { accent: "#7faeab", highlight: "#c8d6cf" },
    textures: ["saline", "clean transients"],
    instruments: ["sub bass", "brush percussion"],
    materials: ["limestone", "frosted glass"],
  },
  {
    key: "floral",
    matches: ["floral", "flower", "violet", "rose", "chamomile", "camomile", "blossom", "white flower", "花", "百合", "フローラル"],
    moodTags: ["floral", "open"],
    atmosphere: ["soft bloom", "petal lift"],
    genres: ["dream pop", "ambient jazz"],
    bpm: 1,
    energy: 1,
    palette: { accent: "#b78cb5" },
    textures: ["soft focus"],
    instruments: ["airy vocal pad"],
    materials: ["vellum", "silk paper"],
  },
  {
    key: "fresh",
    matches: ["citrus", "lemon", "lime", "green apple", "crisp", "fresh", "tart", "爽やか", "レモン", "ライム", "フレッシュ"],
    moodTags: ["fresh", "bright"],
    atmosphere: ["cut-acid brightness", "quick refresh"],
    genres: ["microhouse", "percussive ambient"],
    bpm: 4,
    energy: 4,
    palette: { highlight: "#d7d572" },
    textures: ["snap", "clean edges"],
    instruments: ["wood block", "tight shaker"],
    materials: ["clear ice"],
  },
  {
    key: "earthy",
    matches: ["earth", "forest", "soil", "moss", "leaf", "tobacco", "garrigue", "herb", "herbal", "olive", "smoke", "森", "土", "煙", "ハーブ"],
    moodTags: ["earthy", "grounded"],
    atmosphere: ["forest-floor depth", "dry herb air"],
    genres: ["dub", "cosmic jazz"],
    bpm: -3,
    energy: -1,
    palette: { highlight: "#7f8c55", anchor: "#12161c" },
    textures: ["grain", "dry finish"],
    instruments: ["tom drum", "bass clarinet"],
    materials: ["raw timber", "smoked glass"],
  },
  {
    key: "juicy",
    matches: ["juicy", "strawberry", "raspberry", "cherry", "berry", "plum", "candied", "light-bodied", "ジューシー", "チェリー", "ベリー"],
    moodTags: ["playful", "juicy"],
    atmosphere: ["red-fruit bounce", "speaker-friendly immediacy"],
    genres: ["indie disco", "post-punk funk"],
    bpm: 6,
    energy: 8,
    palette: { accent: "#cf5368" },
    textures: ["bounce", "direct fruit"],
    instruments: ["rubber bass", "snappy snare"],
    materials: ["gloss tile"],
  },
  {
    key: "textural",
    matches: ["tannic", "textured", "skin", "amber", "tea", "walnut", "almond", "oxidative", "beeswax", "honey", "structured", "スキン", "タンニン", "テクスチャ"],
    moodTags: ["textural", "slow-build"],
    atmosphere: ["grainy air", "extended finish"],
    genres: ["leftfield downtempo", "fourth world"],
    bpm: -4,
    energy: -1,
    palette: { accent: "#c98848", surface: "#8a5d40" },
    textures: ["grain", "long decay"],
    instruments: ["frame drum", "processed reed"],
    materials: ["ceramic", "aged wood"],
  },
  {
    key: "volcanic",
    matches: ["volcanic", "ash", "lava", "etna", "sicily", "silex", "火山", "エトナ", "シチリア"],
    moodTags: ["charged", "volcanic"],
    atmosphere: ["ash glow", "subterranean pressure"],
    genres: ["dub techno", "percussive ambient"],
    bpm: -1,
    energy: 3,
    palette: { accent: "#b55a31", anchor: "#18181d" },
    textures: ["heat shimmer", "stone dust"],
    instruments: ["modular synth", "taiko-like toms"],
    materials: ["basalt", "oxidized iron"],
  },
  {
    key: "sparkling",
    matches: ["pet nat", "petnat", "sparkling", "frizzante", "pétillant", "brioche", "bubble", "泡"],
    moodTags: ["effervescent"],
    atmosphere: ["glass-clink motion", "quick fizz release"],
    genres: ["boogie", "broken beat"],
    bpm: 5,
    energy: 6,
    palette: { accent: "#89cbc4" },
    textures: ["bubbles", "lift"],
    instruments: ["claps", "congas"],
    materials: ["clear glass", "steel"],
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function mergeText(...parts) {
  return parts
    .flat()
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
}

function latinTokens(text) {
  return mergeText(text)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function matchesAny(text, words = []) {
  const source = mergeText(text);
  const tokens = latinTokens(source);
  return words.some((word) => {
    const normalized = String(word).normalize("NFKC").toLowerCase();
    if (normalized.length <= 3 && /^[a-z0-9]+$/.test(normalized)) {
      return tokens.includes(normalized);
    }
    return source.includes(normalized);
  });
}

function countryPresetFor(country) {
  const text = mergeText(country);
  return COUNTRY_PRESETS.find((preset) => matchesAny(text, preset.matches)) ?? null;
}

function gradientFromPalette(palette) {
  return `linear-gradient(135deg, ${palette.background} 0%, ${palette.surface} 32%, ${palette.accent} 68%, ${palette.anchor} 100%)`;
}

function paletteRows(palette) {
  return [
    { role: "background", label: "Base", hex: palette.background },
    { role: "surface", label: "Surface", hex: palette.surface },
    { role: "accent", label: "Accent", hex: palette.accent },
    { role: "highlight", label: "Highlight", hex: palette.highlight },
    { role: "anchor", label: "Anchor", hex: palette.anchor },
  ];
}

function buildDescriptorText(wine) {
  return mergeText(
    wine.name,
    wine.producer,
    wine.country,
    wine.region,
    wine.appellation,
    wine.notes,
    wine.farming,
    wine.filtration,
    wine.grapes,
    wine.styles,
    wine.flavors,
  );
}

function wineFlag(country) {
  return FLAG_MAP[country] ?? "";
}

function colorLabel(color) {
  return COLOR_MAP[color]?.label ?? String(color ?? "unknown").toUpperCase();
}

function farmingLabel(farming) {
  return FARMING_MAP[farming]?.label ?? String(farming ?? "unknown");
}

function naturalnessBand(score) {
  if (!Number.isFinite(score)) return "unknown";
  if (score >= 7.5) return "high";
  if (score >= 5) return "medium";
  return "low";
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return null;
  if (value >= 1000) return `¥${Number(value).toLocaleString("ja-JP")}`;
  return `€${Number(value).toFixed(value % 1 ? 2 : 0)}`;
}

function summarizeSimilar(similar = []) {
  return (similar ?? []).slice(0, 4).map((item) => ({
    id: item.wine.id,
    name: item.wine.name,
    producer: item.wine.producer,
    region: item.wine.region,
    color: item.wine.color,
    score: Number(item.score.toFixed(1)),
    reasons: item.reasons.slice(0, 3),
  }));
}

function derivedFeatureList(wine, modifiers, natScore, similarCount) {
  return unique([
    `${colorLabel(wine.color)} profile`,
    wine.country && wine.region ? `${wine.country} / ${wine.region}` : wine.country || wine.region,
    (wine.grapes ?? []).slice(0, 2).join(" / "),
    wine.farming && wine.farming !== "unknown" ? farmingLabel(wine.farming) : null,
    wine.addedSo2 === false ? "no added SO2" : null,
    wine.filtration && wine.filtration !== "unknown" ? `${wine.filtration} filtration` : null,
    modifiers.slice(0, 3).map((modifier) => modifier.key),
    Number.isFinite(natScore) ? `naturalness ${natScore.toFixed(1)}/10` : null,
    similarCount ? `${similarCount} related catalog matches` : null,
  ]);
}

function buildPrompt(wine, payload) {
  const genres = [payload.music.primaryGenre, ...payload.music.supportingGenres].filter(Boolean).join(", ");
  const colors = payload.palette.colors.map((color) => `${color.label}:${color.hex}`).join(", ");
  return [
    `Wine signal for ${wine.name} by ${wine.producer}.`,
    `Build a scene with ${payload.scene.moodTags.join(", ")} energy.`,
    `Palette ${colors}.`,
    `Music in ${genres} around ${payload.music.bpm} BPM`,
    `with ${payload.music.textures.join(", ")} textures and ${payload.music.instruments.join(", ")} instrumentation.`,
  ].join(" ");
}

export function findSpotlightWine(catalog = [], inventory = []) {
  const fromCatalog = catalog.find((wine) => (
    wine.name === SPOTLIGHT_WINE_MATCH.name
    && wine.producer === SPOTLIGHT_WINE_MATCH.producer
  ));

  if (fromCatalog) return fromCatalog;

  const fromInventory = inventory.find((item) => (
    item?.wine?.name === SPOTLIGHT_WINE_MATCH.name
    && item?.wine?.producer === SPOTLIGHT_WINE_MATCH.producer
  ));

  return fromInventory?.wine ?? null;
}

export function buildSpotlightSignal(wine, options = {}) {
  if (!wine) return null;

  const theme = COLOR_THEMES[wine.color] ?? COLOR_THEMES.white;
  const countryPreset = countryPresetFor(wine.country);
  const descriptors = buildDescriptorText(wine);
  const similar = Array.isArray(options.similar) ? options.similar : [];
  const natScore = naturalness(wine);

  const palette = {
    ...theme.palette,
    ...(countryPreset?.palette ?? {}),
  };
  const moodTags = [...theme.moodTags, ...(countryPreset?.moodTags ?? [])];
  const atmosphere = [...theme.atmosphere, ...(countryPreset?.atmosphere ?? [])];
  const materials = [...theme.materials, ...(countryPreset?.materials ?? [])];
  const textures = [...theme.music.textures];
  const instruments = [...theme.music.instruments];
  const genres = [...theme.music.genres, ...(countryPreset?.genres ?? [])];

  let bpm = theme.music.bpm;
  let energy = theme.music.energy;
  let danceability = theme.music.danceability;

  const matchedModifiers = [];
  for (const modifier of MODIFIERS) {
    if (!matchesAny(descriptors, modifier.matches)) continue;
    matchedModifiers.push(modifier);
    moodTags.push(...(modifier.moodTags ?? []));
    atmosphere.push(...(modifier.atmosphere ?? []));
    materials.push(...(modifier.materials ?? []));
    textures.push(...(modifier.textures ?? []));
    instruments.push(...(modifier.instruments ?? []));
    genres.push(...(modifier.genres ?? []));
    bpm += modifier.bpm ?? 0;
    energy += modifier.energy ?? 0;
    danceability += modifier.danceability ?? 0;
    Object.assign(palette, modifier.palette ?? {});
  }

  if (wine.farming === "biodynamic") {
    moodTags.push("living-vineyard");
    atmosphere.push("organic pulse");
    genres.push("folk electronics");
    materials.push("raw wood");
  }

  if (wine.farming === "organic") {
    moodTags.push("clean-grown");
    genres.push("organic house");
  }

  if (wine.addedSo2 === false) {
    moodTags.push("unvarnished");
    atmosphere.push("raw edge detail");
    genres.push("freeform house");
  }

  if (wine.filtration === "none") {
    moodTags.push("cloudy-detail");
    atmosphere.push("unfiltered contour");
  }

  if (Number.isFinite(wine.abv) && wine.abv >= 13.5) {
    bpm -= 3;
    energy += 4;
    atmosphere.push("warmer finish weight");
  }

  if (Number.isFinite(natScore) && natScore >= 7.5) {
    moodTags.push("off-grid");
    genres.push("low-slung experimental");
  }

  if (Number.isFinite(natScore) && natScore <= 4) {
    moodTags.push("polished");
    atmosphere.push("more defined edges");
  }

  bpm = Math.round(clamp(bpm, 82, 132));
  energy = Math.round(clamp(energy, 15, 95));
  danceability = Math.round(clamp(danceability, 15, 95));

  const primaryGenre = unique(genres)[0] ?? theme.music.genres[0];
  const supportingGenres = unique(genres).slice(1, 5);
  const moodList = unique(moodTags).slice(0, 8);
  const atmosphereList = unique(atmosphere).slice(0, 6);
  const materialList = unique(materials).slice(0, 6);
  const textureList = unique(textures).slice(0, 5);
  const instrumentList = unique(instruments).slice(0, 5);
  const derivedFrom = derivedFeatureList(wine, matchedModifiers, natScore, similar.length);

  const payload = {
    schema: "natural-wine-research/spotlight-signal@1",
    generatedAt: new Date().toISOString(),
    wine: {
      id: wine.id,
      name: wine.name,
      producer: wine.producer,
      country: wine.country,
      flag: wineFlag(wine.country),
      region: wine.region,
      appellation: wine.appellation ?? null,
      vintage: wine.vintage ?? null,
      color: wine.color,
      colorLabel: colorLabel(wine.color),
      price: Number.isFinite(wine.price) ? wine.price : null,
      priceLabel: formatPrice(wine.price),
      bottleMl: Number.isFinite(wine.bottleMl) ? wine.bottleMl : null,
      abv: Number.isFinite(wine.abv) ? wine.abv : null,
      grapes: (wine.grapes ?? []).slice(0, 6),
      farming: wine.farming ?? "unknown",
      farmingLabel: farmingLabel(wine.farming),
      filtration: wine.filtration ?? "unknown",
      addedSo2: wine.addedSo2 ?? null,
      naturalnessScore: Number.isFinite(natScore) ? Number(natScore.toFixed(1)) : null,
      naturalnessBand: naturalnessBand(natScore),
    },
    palette: {
      gradient: gradientFromPalette(palette),
      colors: paletteRows(palette),
    },
    scene: {
      moodTags: moodList,
      atmosphere: atmosphereList,
      lighting: theme.lighting,
      setting: theme.setting,
      materials: materialList,
      motion: theme.motion,
    },
    music: {
      primaryGenre,
      supportingGenres,
      bpm,
      bpmRange: [Math.max(80, bpm - 6), Math.min(136, bpm + 6)],
      energy,
      danceability,
      textures: textureList,
      instruments: instrumentList,
    },
    context: {
      derivedFrom,
      relatedWines: summarizeSimilar(similar),
      rationale: `Mapped from ${derivedFrom.slice(0, 5).join(", ")} into ${primaryGenre} at ${bpm} BPM with ${moodList.slice(0, 4).join(", ")} cues.`,
    },
    transport: {
      apiPath: `/api/spotlight/signal?wineId=${encodeURIComponent(wine.id)}`,
      eventName: "natural-wine-research:spotlight-signal",
      globalKey: "__NATURAL_WINE_SPOTLIGHT_SIGNAL__",
      messageType: "natural-wine-research:spotlight-signal",
    },
  };

  payload.prompt = buildPrompt(wine, payload);

  return payload;
}

export function buildSpotlightSignalFilename(wine) {
  const parts = [
    wine?.producer,
    wine?.name,
    wine?.vintage,
    "signal",
  ]
    .filter(Boolean)
    .join("-");

  return `${parts || "wine-signal"}`.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .concat(".json");
}
