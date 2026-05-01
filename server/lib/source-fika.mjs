const FIKA_EXCLUDED_CATEGORY_LABELS = new Set([
  "その他酒類",
  "食品",
  "ペルスヴァル",
  "フィーカ オリジナル商品",
  "雑貨",
  "ギフトボックス",
  "セット販売",
]);

const FIKA_TEXT_ENTITY_MAP = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
};

const FIKA_WHITE_GRAPES = [
  "アリゴテ",
  "シャルドネ",
  "ソーヴィニヨン・ブラン",
  "ソーヴィニヨンブラン",
  "シュナン",
  "シュナン・ブラン",
  "リースリング",
  "サヴァニャン",
  "ヴィオニエ",
  "ゲヴュルツトラミネール",
  "ピノ・ブラン",
  "甲州",
  "デラウェア",
  "セミヨン",
  "ミュスカ",
];

const FIKA_RED_GRAPES = [
  "ピノノワール",
  "ガメイ",
  "シラー",
  "シラーズ",
  "カベルネ",
  "メルロー",
  "グルナッシュ",
  "ムールヴェードル",
  "ネッビオーロ",
  "サンジョヴェーゼ",
  "プールサール",
  "トゥルソー",
  "ガルナッチャ",
  "テンプラニーリョ",
  "マスカットベーリーA",
  "カベルネ・フラン",
];

const FIKA_COLOR_RULES = [
  { match: ["オレンジ"], color: "orange" },
  { match: ["ロゼ"], color: "rose" },
  { match: ["泡", "スパークリング", "ペットナット", "ペティアン"], color: "pétillant" },
  { match: ["赤"], color: "red" },
  { match: ["白"], color: "white" },
];

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (entity) => FIKA_TEXT_ENTITY_MAP[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function normalizeWhitespace(value) {
  return decodeHtmlEntities(value)
    .replace(/\r/g, "")
    .replace(/\n+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function stripTags(value) {
  return normalizeWhitespace(
    String(value ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<p[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUrl(baseUrl, href) {
  try {
    return new URL(String(href ?? ""), baseUrl).toString();
  } catch {
    return "";
  }
}

async function fetchFikaHtml(url, options = {}) {
  const maxAttempts = Number.isFinite(options.maxAttempts) ? options.maxAttempts : 4;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 20000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "content-type": options.body ? "application/x-www-form-urlencoded" : undefined,
          "user-agent": "natural-wine-research/collector (+local)",
          ...(options.headers ?? {}),
        },
        body: options.body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Fika fetch failed: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return new TextDecoder("euc-jp").decode(buffer);
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }

  throw new Error("Fika fetch failed");
}

function buildFikaSearchUrl(endpoint, page = 1) {
  const url = new URL(endpoint);
  url.searchParams.set("mode", "srh");
  url.searchParams.set("sort", "n");
  url.searchParams.set("page", String(page));
  return url.toString();
}

function buildPagedUrl(baseUrl, page = 1) {
  const url = new URL(baseUrl);
  url.searchParams.set("page", String(page));
  return url.toString();
}

function parseFikaHomepageCategories(html, baseUrl, source) {
  const section = html.split("<!-- グループここから -->")[0] ?? html;
  const categoryPattern = /<h2><a[^>]+href="([^"]*mode=cate[^"]*csid=0[^"]*)"[^>]*>([^<]+)<\/a><\/h2>/g;
  const categories = [];

  for (const match of section.matchAll(categoryPattern)) {
    const href = normalizeUrl(baseUrl, match[1]);
    const label = normalizeWhitespace(match[2]);
    if (!href || !label || FIKA_EXCLUDED_CATEGORY_LABELS.has(label)) {
      continue;
    }
    categories.push({ href, label });
  }

  const seen = new Set();
  return categories.filter((entry) => {
    if (seen.has(entry.href)) return false;
    seen.add(entry.href);
    return true;
  });
}

function parsePrice(value) {
  const numeric = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function splitNameAndProducer(fullTitle) {
  const cleaned = normalizeWhitespace(fullTitle);
  if (!cleaned) return { name: "", producer: "" };

  const parts = cleaned.split(/\s*\/\s*/);
  if (parts.length < 2) {
    return { name: cleaned, producer: "" };
  }

  return {
    name: parts.slice(0, -1).join(" / ").trim(),
    producer: parts.at(-1)?.trim() ?? "",
  };
}

function parseFikaListPage(html, pageUrl, categoryLabel) {
  const items = [];
  const productPattern = /<li(?: class="([^"]*)")?>\s*<a href="(\?pid=\d+)" class="prd_lst_link">[\s\S]*?<span class="price">\s*([\s\S]*?)\s*<\/span>[\s\S]*?<h1>([\s\S]*?)<\/h1>/g;

  for (const match of html.matchAll(productPattern)) {
    const pid = (match[2].match(/\d+/) ?? [])[0] ?? "";
    const title = stripTags(match[4]);
    const { name, producer } = splitNameAndProducer(title);
    if (!pid || !name || !producer) continue;

    items.push({
      pid,
      name,
      producer,
      price: parsePrice(stripTags(match[3])),
      soldOut: String(match[1] ?? "").includes("sold_out"),
      categoryLabel,
      productUrl: normalizeUrl(pageUrl, match[2]),
    });
  }

  const nextMatch = html.match(/<a href="([^"]+page=\d+[^"]*)" class="icon icon_next">次のページ<\/a>/);

  return {
    items,
    nextPageUrl: nextMatch ? normalizeUrl(pageUrl, nextMatch[1]) : "",
  };
}

function parseJsonFromAssignment(html, variableName) {
  const pattern = new RegExp(`var\\s+${escapeRegExp(variableName)}\\s*=\\s*(\\{[\\s\\S]*?\\});`);
  const match = html.match(pattern);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function parseDefinitionValue(html, label) {
  const pattern = new RegExp(`<dt>${escapeRegExp(label)}<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)(?:<\\/dd>|<\\/dl>)`, "i");
  const match = html.match(pattern);
  if (!match) return "";

  return stripTags(
    match[1]
      .replace(/<dl[\s\S]*$/i, "")
      .replace(/<dt>.*$/i, "")
  );
}

function parseSpanValues(html, label) {
  const pattern = new RegExp(`<dt>${escapeRegExp(label)}<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)(?:<\\/dd>|<\\/dl>)`, "i");
  const match = html.match(pattern);
  if (!match) return [];

  const values = [];
  for (const spanMatch of match[1].matchAll(/<span>([\s\S]*?)<\/span>/g)) {
    const value = stripTags(spanMatch[1]);
    if (value) values.push(value);
  }
  return values;
}

function parseCountryAndRegion(regionText, fallbackCountry = "") {
  const cleaned = normalizeWhitespace(regionText);
  if (!cleaned) {
    return { country: fallbackCountry || "UNKNOWN", region: "Unknown" };
  }

  const bracketMatch = cleaned.match(/^(.+?)[(（](.+?)[)）]$/);
  if (bracketMatch) {
    return {
      country: normalizeWhitespace(bracketMatch[1]) || fallbackCountry || "UNKNOWN",
      region: normalizeWhitespace(bracketMatch[2]) || "Unknown",
    };
  }

  return {
    country: cleaned || fallbackCountry || "UNKNOWN",
    region: "Unknown",
  };
}

function parseVintage(name) {
  const matches = [...String(name ?? "").matchAll(/\b(19|20)\d{2}\b/g)];
  if (!matches.length) return null;
  return Number(matches.at(-1)?.[0] ?? "");
}

function inferFarming(description) {
  const text = normalizeWhitespace(description);
  if (!text) return "unknown";
  if (/ビオディナミ|biodynamic/i.test(text)) return "biodynamic";
  if (/ビオ|有機|オーガニック|organic/i.test(text)) return "organic";
  if (/ナチュラル|自然派|natural/i.test(text)) return "natural";
  return "unknown";
}

function inferAddedSo2(description) {
  const text = normalizeWhitespace(description);
  if (!text) return null;
  if (/SO2無添加|亜硫酸無添加|無添加SO2|酸化防止剤無添加|SO2を含む添加物を排/i.test(text)) return false;
  if (/SO2添加|亜硫酸添加/i.test(text)) return true;
  return null;
}

function inferFiltration(description) {
  const text = normalizeWhitespace(description);
  if (!text) return "unknown";
  if (/無濾過|ノンフィルター|フィルター掛けもしていない|フィルターなし/i.test(text)) return "unfiltered";
  if (/フィルター|濾過/i.test(text)) return "filtered";
  return "unknown";
}

function parseBottleMl(value) {
  const match = String(value ?? "").match(/([0-9]+(?:\.[0-9]+)?)\s*ml/i);
  if (!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseGrapes(value) {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return [];
  return cleaned
    .split(/[、,\/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseAbv(description) {
  const match = normalizeWhitespace(description).match(/アルコール度数\s*([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractDescription(html) {
  const match = html.match(/<h3 class="gFont">Description<\/h3>\s*<div class="txt">([\s\S]*?)<\/div>/i);
  if (!match) return "";
  return stripTags(match[1]);
}

function parseStockCount(html, product) {
  if (Number.isFinite(product?.stock_num)) {
    return Number(product.stock_num);
  }

  const text = parseDefinitionValue(html, "在庫数");
  const numeric = Number(String(text).replace(/[^0-9]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function listingToRecord(listing) {
  return {
    name: listing.name,
    producer: listing.producer,
    country: "UNKNOWN",
    region: "Unknown",
    grapes: [],
    vintage: parseVintage(listing.name),
    color: inferColor([], [], listing.name, ""),
    farming: "unknown",
    addedSo2: null,
    filtration: "unknown",
    price: listing.price,
    bottleMl: null,
    abv: null,
    flavors: [],
    styles: [],
    aliases: [],
    labelText: [],
    notes: normalizeWhitespace([
      "Imported from Fika listing page",
      listing.soldOut ? "Status: sold out" : "Status: available",
    ].join("\n")),
    sourceUrl: listing.productUrl,
  };
}

function inferColor(typeValues, grapes, name, description) {
  const normalizedTypeValues = typeValues.filter((value) => {
    return ["赤", "白", "ロゼ", "オレンジ", "泡", "スパークリング", "ペットナット", "ペティアン"].some((token) => value.includes(token));
  });

  const explicitHaystack = `${normalizedTypeValues.join(" ")} ${name}`.trim();
  const sparklingHaystack = `${explicitHaystack} ${description}`.trim();

  if (["ペットナット", "ペティアン", "スパークリング"].some((token) => sparklingHaystack.includes(token))) {
    return "pétillant";
  }
  if (["オレンジ"].some((token) => sparklingHaystack.includes(token))) {
    return "orange";
  }
  if (["ロゼ"].some((token) => sparklingHaystack.includes(token))) {
    return "rose";
  }

  const joinedGrapes = grapes.join(" ");
  const hasWhiteGrape = FIKA_WHITE_GRAPES.some((token) => joinedGrapes.includes(token));
  const hasRedGrape = FIKA_RED_GRAPES.some((token) => joinedGrapes.includes(token));
  if (hasWhiteGrape && !hasRedGrape) return "white";
  if (hasRedGrape && !hasWhiteGrape) return "red";

  for (const rule of FIKA_COLOR_RULES) {
    if (rule.match.some((token) => explicitHaystack.includes(token))) {
      return rule.color;
    }
  }

  if (/(ブラン|blanc|white)/i.test(explicitHaystack) && !/(ルージュ|rouge|red)/i.test(explicitHaystack)) return "white";
  if (/(ルージュ|rouge|red)/i.test(explicitHaystack) && !/(ブラン|blanc|white)/i.test(explicitHaystack)) return "red";

  return "unknown";
}

function parseProductDetail(listing, html) {
  const colorme = parseJsonFromAssignment(html, "Colorme");
  const product = colorme?.product ?? {};
  const description = extractDescription(html);
  const regionText = parseDefinitionValue(html, "生産地域");
  const typeSpans = parseSpanValues(html, "タイプ");
  const grapes = parseGrapes(parseDefinitionValue(html, "品種"));
  const bottleMl = parseBottleMl(parseDefinitionValue(html, "容量"));
  const stockCount = parseStockCount(html, product);
  const countryAndRegion = parseCountryAndRegion(regionText, listing.categoryLabel);
  const productName = normalizeWhitespace(product?.name || "");
  const splitProduct = splitNameAndProducer(productName);
  const producer = splitProduct.producer || listing.producer;
  const color = inferColor(typeSpans, grapes, listing.name, description);
  const price = Number.isFinite(product?.sales_price_including_tax)
    ? Number(product.sales_price_including_tax)
    : listing.price;
  const productUrl = listing.productUrl;

  return {
    name: listing.name,
    producer,
    country: countryAndRegion.country,
    region: countryAndRegion.region,
    grapes,
    vintage: parseVintage(listing.name),
    color,
    farming: inferFarming(description),
    addedSo2: inferAddedSo2(description),
    filtration: inferFiltration(description),
    price,
    bottleMl,
    abv: parseAbv(description),
    flavors: [],
    styles: [],
    aliases: [],
    labelText: [],
    notes: normalizeWhitespace(
      [
        description,
        stockCount === null ? "" : `Stock count: ${stockCount}`,
        listing.soldOut ? "Status: sold out" : "Status: available",
      ]
        .filter(Boolean)
        .join("\n")
    ),
    sourceUrl: productUrl,
  };
}

function isMeaningfulFikaString(value, fallback) {
  return Boolean(value && normalizeWhitespace(value) && normalizeWhitespace(value) !== fallback);
}

function isMeaningfulFikaArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function isMeaningfulFikaNumber(value) {
  return Number.isFinite(value);
}

function extractFikaSourceUrl(record) {
  const sourceRef = (record?.sourceRefs ?? []).find((entry) => entry?.sourceId === "fika-online-shop");
  return normalizeUrl("https://fikas.shop/", sourceRef?.sourceUrl ?? "");
}

function buildListingFromCatalogRecord(record) {
  const productUrl = extractFikaSourceUrl(record);
  if (!productUrl) return null;

  return {
    name: normalizeWhitespace(record?.name),
    producer: normalizeWhitespace(record?.producer),
    price: isMeaningfulFikaNumber(record?.price) ? Number(record.price) : null,
    soldOut: /status:\s*sold out/i.test(normalizeWhitespace(record?.notes)),
    categoryLabel: isMeaningfulFikaString(record?.country, "UNKNOWN") ? normalizeWhitespace(record.country) : "",
    productUrl,
  };
}

export function needsFikaMetadataEnrichment(record) {
  if (!extractFikaSourceUrl(record)) return false;

  if (!isMeaningfulFikaString(record?.country, "UNKNOWN")) return true;
  if (!isMeaningfulFikaArray(record?.grapes)) return true;
  if (!isMeaningfulFikaNumber(record?.bottleMl)) return true;
  if (!isMeaningfulFikaString(record?.color, "unknown")) return true;
  if (/^Imported from Fika listing page\b/i.test(normalizeWhitespace(record?.notes))) return true;

  return false;
}

export async function enrichFikaCatalogRecord(record) {
  const listing = buildListingFromCatalogRecord(record);
  if (!listing) {
    return record;
  }

  try {
    const detailHtml = await fetchFikaHtml(listing.productUrl, {
      method: "POST",
      body: "restricted_age_agree=1",
    });
    const detail = parseProductDetail(listing, detailHtml);

    return {
      ...record,
      country: isMeaningfulFikaString(detail.country, "UNKNOWN") ? detail.country : record.country,
      region: isMeaningfulFikaString(detail.region, "Unknown") ? detail.region : record.region,
      grapes: isMeaningfulFikaArray(detail.grapes) ? detail.grapes : record.grapes,
      vintage: isMeaningfulFikaNumber(detail.vintage) ? detail.vintage : record.vintage,
      color: isMeaningfulFikaString(detail.color, "unknown") ? detail.color : record.color,
      farming: isMeaningfulFikaString(detail.farming, "unknown") ? detail.farming : record.farming,
      addedSo2: detail.addedSo2 ?? record.addedSo2,
      filtration: isMeaningfulFikaString(detail.filtration, "unknown") ? detail.filtration : record.filtration,
      price: isMeaningfulFikaNumber(detail.price) ? detail.price : record.price,
      bottleMl: isMeaningfulFikaNumber(detail.bottleMl) ? detail.bottleMl : record.bottleMl,
      abv: isMeaningfulFikaNumber(detail.abv) ? detail.abv : record.abv,
      notes: isMeaningfulFikaString(detail.notes, "") ? detail.notes : record.notes,
    };
  } catch {
    return record;
  }
}

async function collectPagedListings(baseUrl, maxItems, categoryLabel, options = {}) {
  const pageSize = Number.isFinite(options.pageSize) && options.pageSize > 0 ? options.pageSize : 18;
  const batchSize = Number.isFinite(options.batchSize) && options.batchSize > 0 ? options.batchSize : 8;
  const seenPids = new Set();
  const listings = [];

  for (let pageStart = 1; ; pageStart += batchSize) {
    if (Number.isFinite(maxItems) && maxItems > 0 && listings.length >= maxItems) {
      break;
    }

    const urls = Array.from({ length: batchSize }, (_, index) => buildPagedUrl(baseUrl, pageStart + index));
    const pages = await Promise.all(
      urls.map(async (url) => {
        const html = await fetchFikaHtml(url);
        return parseFikaListPage(html, url, categoryLabel);
      })
    );

    let reachedEnd = false;
    for (const page of pages) {
      for (const item of page.items) {
        if (Number.isFinite(maxItems) && maxItems > 0 && listings.length >= maxItems) {
          break;
        }
        if (!item.pid || seenPids.has(item.pid)) continue;
        seenPids.add(item.pid);
        listings.push(item);
      }

      if (!page.items.length || !page.nextPageUrl || page.items.length < pageSize) {
        reachedEnd = true;
      }
    }

    if (reachedEnd) {
      break;
    }
  }

  return listings;
}

async function collectCategoryListings(category, source, maxItems) {
  return collectPagedListings(category.href, maxItems, category.label, { batchSize: 8, pageSize: 18 });
}

async function collectHomepageCategoryListings(endpoint, source, maxItems) {
  const html = await fetchFikaHtml(endpoint);
  const categories = parseFikaHomepageCategories(html, endpoint, source);
  const seenPids = new Set();
  const listings = [];

  for (let index = 0; index < categories.length; index += 3) {
    if (Number.isFinite(maxItems) && maxItems > 0 && listings.length >= maxItems) {
      break;
    }

    const batch = categories.slice(index, index + 3);
    const remaining = Number.isFinite(maxItems) && maxItems > 0 ? maxItems - listings.length : null;
    const batchResults = await Promise.all(
      batch.map((category) => collectCategoryListings(category, source, remaining))
    );

    for (const categoryListings of batchResults) {
      for (const item of categoryListings) {
        if (Number.isFinite(maxItems) && maxItems > 0 && listings.length >= maxItems) {
          break;
        }
        if (!item.pid || seenPids.has(item.pid)) continue;
        seenPids.add(item.pid);
        listings.push(item);
      }
    }
  }

  return listings;
}

async function collectPaginatedListings(startUrl, maxItems) {
  return collectPagedListings(startUrl, maxItems, "", { batchSize: 8, pageSize: 18 });
}

async function collectFixedSearchListings(endpoint, maxItems) {
  return collectPagedListings(buildFikaSearchUrl(endpoint, 1), maxItems, "", { batchSize: 8, pageSize: 18 });
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = [];

  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    const settled = await Promise.all(chunk.map((item) => mapper(item)));
    results.push(...settled);
  }

  return results;
}

export async function collectFikaProducts(source, endpoint, options = {}) {
  const maxItems = Number.isFinite(options.limit) && options.limit > 0
    ? options.limit
    : Number.isFinite(source.limit) && source.limit > 0
      ? source.limit
      : null;
  const searchUrl = buildFikaSearchUrl(endpoint, 1);
  const uniqueListings = maxItems !== null && maxItems > 1000
    ? await collectHomepageCategoryListings(endpoint, source, maxItems)
    : await collectPaginatedListings(searchUrl, maxItems);

  if (maxItems !== null && maxItems > 1000) {
    return uniqueListings.map((listing) => listingToRecord(listing));
  }

  const detailed = await mapWithConcurrency(uniqueListings, 4, async (listing) => {
    try {
      const detailHtml = await fetchFikaHtml(listing.productUrl, {
        method: "POST",
        body: "restricted_age_agree=1",
      });
      return parseProductDetail(listing, detailHtml);
    } catch {
      return {
        name: listing.name,
        producer: listing.producer,
        country: listing.categoryLabel || "UNKNOWN",
        region: "Unknown",
        grapes: [],
        vintage: parseVintage(listing.name),
        color: "unknown",
        farming: "unknown",
        addedSo2: null,
        filtration: "unknown",
        price: listing.price,
        bottleMl: null,
        abv: null,
        flavors: [],
        styles: [],
        aliases: [],
        labelText: [],
        notes: listing.soldOut ? "Status: sold out" : "Status: available",
        sourceUrl: listing.productUrl,
      };
    }
  });

  return detailed.filter((item) => item.name && item.producer);
}
