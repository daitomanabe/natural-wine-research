(function bootStoreUi() {
  const state = {
    payload: null,
    apiBase: "",
    apiConnected: false,
    apiMessage: "",
    status: "",
    error: "",
    unlocked: false,
    passwordBusy: false,
    adminToken: "",
    ingestResult: null,
    ingestJobId: "",
    ingestJobStatus: "",
    animationFrame: 0,
    rotationEnabled: true,
    previews: {
      front: "",
      back: "",
    },
    selectedFiles: {
      front: null,
      back: null,
    },
    draft: {
      location: "店内",
      quantity: 1,
      notes: "",
    },
    filters: {
      query: "",
      color: "",
      country: "",
      genre: "",
      farming: "",
      sort: "name",
    },
    filtersOpen: false,
  };

  const config = window.__STORE_PAGE_CONFIG__ || {};
  const root = document.querySelector("[data-store-app]");
  const overlay = document.querySelector("[data-password-overlay]");
  const pageMode = config.mode === "admin" ? "admin" : "public";
  const requiresAuth = pageMode === "admin" && Boolean(config.password?.hash);
  const sessionKey = config.password?.storageKey || "natural-wine-store-pages";
  const adminTokenKey = config.password?.tokenStorageKey || `${sessionKey}:token`;
  const apiStorageKey = "natural-wine-store-api-base";
  const defaultApiBase = config.defaultApiBase || "";
  const payloadPath = config.payloadPath || "./store.json";
  const publicPath = config.links?.public || "./";
  const adminPath = config.links?.admin || "./admin/";

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatYen(value) {
    return Number.isFinite(Number(value)) ? `¥${Number(value).toLocaleString("ja-JP")}` : "—";
  }

  function formatPercent(value) {
    return `${Math.round(Number(value) || 0)}%`;
  }

  function excerpt(value, maxLength = 360) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).trim()}…`;
  }

  function mapRange(value, inputMin, inputMax, outputMin, outputMax) {
    if (inputMax === inputMin) return outputMin;
    return outputMin + ((value - inputMin) / (inputMax - inputMin)) * (outputMax - outputMin);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeToken(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function isAdminMode() {
    return pageMode === "admin";
  }

  function hasLiveApi() {
    return Boolean(state.apiBase);
  }

  function usesSameOriginApi() {
    return state.apiBase === "same-origin";
  }

  function isTabletViewport() {
    return window.innerWidth < 1080;
  }

  function isCompactViewport() {
    return window.innerWidth < 960;
  }

  function buildWineSearchIndex(wine) {
    return normalizeToken([
      wine.name,
      wine.producer,
      wine.country,
      wine.region,
      wine.appellation,
      wine.colorLabel,
      wine.farmingLabel,
      wine.transforms?.sound?.primaryGenre,
      ...(wine.transforms?.sound?.supportingGenres || []),
      ...(wine.grapes || []),
      ...(wine.transforms?.atmosphere?.moodTags || []),
    ].join(" "));
  }

  function buildFilterModel(payload) {
    const wines = payload?.wines || [];
    const collect = (selector) => [...new Set(wines.map(selector).filter(Boolean))].sort((left, right) => String(left).localeCompare(String(right), "ja"));
    return {
      colors: collect((wine) => wine.colorLabel),
      countries: collect((wine) => wine.country),
      genres: collect((wine) => wine.transforms?.sound?.primaryGenre),
      farming: collect((wine) => wine.farmingLabel),
    };
  }

  function sortWines(wines) {
    const sort = state.filters.sort || "name";
    const list = [...wines];
    switch (sort) {
      case "producer":
        return list.sort((left, right) => String(left.producer).localeCompare(String(right.producer), "ja") || String(left.name).localeCompare(String(right.name), "ja"));
      case "priceAsc":
        return list.sort((left, right) => (Number(left.price) || Number.MAX_SAFE_INTEGER) - (Number(right.price) || Number.MAX_SAFE_INTEGER) || String(left.name).localeCompare(String(right.name), "ja"));
      case "priceDesc":
        return list.sort((left, right) => (Number(right.price) || 0) - (Number(left.price) || 0) || String(left.name).localeCompare(String(right.name), "ja"));
      case "vintageDesc":
        return list.sort((left, right) => (Number(right.vintage) || 0) - (Number(left.vintage) || 0) || String(left.name).localeCompare(String(right.name), "ja"));
      case "bpmDesc":
        return list.sort((left, right) => (Number(right.transforms?.sound?.bpm) || 0) - (Number(left.transforms?.sound?.bpm) || 0) || String(left.name).localeCompare(String(right.name), "ja"));
      default:
        return list.sort((left, right) => String(left.name).localeCompare(String(right.name), "ja"));
    }
  }

  function filterWines(payload) {
    const wines = payload?.wines || [];
    const query = normalizeToken(state.filters.query);

    return sortWines(wines.filter((wine) => {
      if (query && !buildWineSearchIndex(wine).includes(query)) return false;
      if (state.filters.color && wine.colorLabel !== state.filters.color) return false;
      if (state.filters.country && wine.country !== state.filters.country) return false;
      if (state.filters.genre && wine.transforms?.sound?.primaryGenre !== state.filters.genre) return false;
      if (state.filters.farming && wine.farmingLabel !== state.filters.farming) return false;
      return true;
    }));
  }

  function getRouteWineSlug() {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!hash.startsWith("wine-")) return "";
    return hash.slice("wine-".length);
  }

  function findRouteWine(payload) {
    const slug = getRouteWineSlug();
    if (!slug) return null;
    return (payload?.wines || []).find((wine) => wine.slug === slug || wine.id === slug) || null;
  }

  function renderResponsiveImage(wine, className = "wine-image") {
    if (!wine.imagePath) {
      return `<div class="${className} wine-image-empty">NO IMAGE</div>`;
    }

    const sources = Array.isArray(wine.imageSources) ? wine.imageSources : [];
    return `
      <picture>
        ${sources.map((source) => `<source type="${esc(source.type)}" srcset="${esc(source.srcset)}">`).join("")}
        <img class="${className}" src="${esc(wine.imagePath)}" alt="${esc(wine.name)}" loading="lazy" decoding="async">
      </picture>
    `;
  }

  function createSvg2d(embedding) {
    const width = 640;
    const height = 420;
    const padding = { top: 26, right: 28, bottom: 56, left: 58 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const xZero = padding.left + innerWidth / 2;
    const yZero = padding.top + innerHeight / 2;
    const axisX = embedding.axes?.[0]?.label || "umap-x";
    const axisY = embedding.axes?.[1]?.label || "umap-y";
    const circles = (embedding.points || []).map((point) => {
      const x = padding.left + ((point.x2d + 1) / 2) * innerWidth;
      const y = padding.top + (1 - (point.y2d + 1) / 2) * innerHeight;
      return `
        <a href="#wine-${esc(point.slug)}">
          <circle cx="${x}" cy="${y}" r="15" fill="${esc(point.accentHex)}" stroke="rgba(255,255,255,0.65)" stroke-width="1.5"></circle>
          <text x="${x}" y="${y + 4}" text-anchor="middle" fill="#071018" font-size="11" font-family="IBM Plex Mono, monospace">${point.index}</text>
        </a>
      `;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" class="embedding-svg" role="img" aria-label="2D embedding map">
        <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(7, 12, 18, 0.65)" rx="18"></rect>
        <line x1="${padding.left}" y1="${yZero}" x2="${width - padding.right}" y2="${yZero}" stroke="rgba(148, 174, 187, 0.28)" stroke-width="1"></line>
        <line x1="${xZero}" y1="${padding.top}" x2="${xZero}" y2="${height - padding.bottom}" stroke="rgba(148, 174, 187, 0.28)" stroke-width="1"></line>
        <rect x="${padding.left}" y="${padding.top}" width="${innerWidth}" height="${innerHeight}" fill="none" stroke="rgba(148, 174, 187, 0.15)" stroke-width="1"></rect>
        ${circles}
        <text x="${width / 2}" y="${height - 18}" text-anchor="middle" fill="#8ca6b2" font-size="12" font-family="IBM Plex Mono, monospace">${esc(axisX)}</text>
        <text x="20" y="${height / 2}" transform="rotate(-90 20 ${height / 2})" text-anchor="middle" fill="#8ca6b2" font-size="12" font-family="IBM Plex Mono, monospace">${esc(axisY)}</text>
      </svg>
    `;
  }

  function renderLegend(points) {
    return `
      <div class="embedding-legend">
        ${(points || []).map((point) => `
          <a href="#wine-${esc(point.slug)}" class="legend-item">
            <span class="legend-index" style="background:${esc(point.accentHex)}">${point.index}</span>
            <span>${esc(`${point.flag ? `${point.flag} ` : ""}${point.name}`)}</span>
          </a>
        `).join("")}
      </div>
    `;
  }

  function renderAxisCards(axes) {
    return `
      <div class="axis-grid">
        ${(axes || []).slice(0, 3).map((axis, index) => `
          <div class="axis-card">
            <div class="axis-title">UMAP ${index + 1}</div>
            <div class="axis-label">${esc(axis.label || axis.id || `axis-${index + 1}`)}</div>
            <div class="axis-variance">${esc(axis.explainedVariance == null ? "nonlinear manifold axis" : `${axis.explainedVariance}% variance`)}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderPalette(colors) {
    return `
      <div class="palette-row">
        ${(colors || []).map((color) => `
          <div class="swatch-card">
            <span class="swatch-color" style="background:${esc(color.hex)}"></span>
            <div class="swatch-copy">
              <div>${esc(color.label)}</div>
              <div>${esc(color.hex)}</div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderMeters(rows) {
    return `
      <div class="meter-grid">
        ${(rows || []).map((row) => `
          <div class="meter-row">
            <div class="meter-head">
              <span>${esc(row.label)}</span>
              <span>${esc(row.display)}</span>
            </div>
            <div class="meter-track"><span style="width:${clamp(row.value, 0, 100)}%; background:${esc(row.color)}"></span></div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderStoreProfile(profile) {
    const compact = isCompactViewport();
    const summaryRows = [
      {
        label: "Avg BPM",
        value: mapRange(profile.averageBpm || 0, 80, 136, 0, 100),
        display: `${profile.averageBpm || 0} BPM`,
        color: "#8fd0c5",
      },
      {
        label: "Energy",
        value: profile.averageEnergy || 0,
        display: formatPercent(profile.averageEnergy || 0),
        color: "#dd7e5d",
      },
      {
        label: "Brightness",
        value: profile.averageBrightness || 0,
        display: formatPercent(profile.averageBrightness || 0),
        color: "#cfd6bc",
      },
      {
        label: "Warmth",
        value: profile.averageWarmth || 0,
        display: formatPercent(profile.averageWarmth || 0),
        color: "#d59263",
      },
      {
        label: "Contrast",
        value: profile.averageContrast || 0,
        display: formatPercent(profile.averageContrast || 0),
        color: "#85adc3",
      },
      {
        label: "Naturalness",
        value: profile.averageNaturalness || 0,
        display: formatPercent(profile.averageNaturalness || 0),
        color: "#7cc38b",
      },
    ];

    const chips = (items, valueKey, countKey) => (items || []).map((item) => `
      <span class="info-chip">
        <strong>${esc(item[valueKey])}</strong>
        <em>${esc(item[countKey])}</em>
      </span>
    `).join("");

    const body = `
        <div class="panel-head">
          <div>
            <div class="section-label">セレクション</div>
            <h2>この日のセレクションの個性</h2>
          </div>
          <div class="micro-copy">店内のワインを、味わいと雰囲気の両面からまとめています。</div>
        </div>
        <div class="dna-grid">
          <div class="dna-main">
            <div class="narrative-block">${esc(profile.narrative || "")}</div>
            <div class="gradient-strip" style="background:${esc(profile.palette?.gradient || "")}"></div>
            ${renderMeters(summaryRows)}
          </div>
          <div class="dna-side">
            <div>
              <div class="subsection-label">Top Genres</div>
              <div class="chip-row">${chips(profile.topGenres, "genre", "count")}</div>
            </div>
            <div>
              <div class="subsection-label">Mood Tags</div>
              <div class="chip-row">${chips(profile.topMoodTags, "tag", "count")}</div>
            </div>
            <div>
              <div class="subsection-label">Dominant Features</div>
              <div class="chip-row">${chips(profile.dominantFeatures, "label", "value")}</div>
            </div>
            <div>
              <div class="subsection-label">Color Mix</div>
              <div class="chip-row">${chips(profile.colorDistribution, "colorLabel", "count")}</div>
            </div>
          </div>
        </div>
        ${renderPalette(profile.palette?.colors || [])}
    `;

    return `
      <section class="module-panel dna-panel">
        ${compact ? `
          <details class="module-details">
            <summary class="module-summary">
              <span class="section-label">セレクション</span>
              <strong>この日のセレクションの個性</strong>
            </summary>
            <div class="module-details-body">${body}</div>
          </details>
        ` : body}
      </section>
    `;
  }

  function renderEmbedding(payload) {
    const compact = isCompactViewport();
    const body = `
      <div class="panel-head">
        <div>
          <div class="section-label">マップ</div>
          <h2>ワインの位置関係マップ</h2>
        </div>
        <div class="micro-copy">${(payload.embedding?.featureOrder || []).length}の指標から、ワイン同士の距離感を可視化しています。</div>
      </div>
      <div class="embed-grid">
        <div class="embed-card">
          <div class="subsection-label">2D Map</div>
          ${createSvg2d(payload.embedding || { points: [], axes: [] })}
          ${renderLegend(payload.embedding?.points || [])}
        </div>
        <div class="embed-card">
          <div class="subsection-label">3D Map</div>
          <canvas class="embedding-canvas" data-embedding-canvas></canvas>
          <div class="action-row">
            <button type="button" class="micro-action secondary-button" data-toggle-rotation>回転を止める</button>
          </div>
          ${renderLegend(payload.embedding?.points || [])}
        </div>
      </div>
      ${renderAxisCards(payload.embedding?.axes || [])}
    `;

    return `
      <section class="module-panel embed-panel" id="embeddings">
        ${compact ? `
          <details class="module-details">
            <summary class="module-summary">
              <span class="section-label">マップ</span>
              <strong>ワインの位置関係マップ</strong>
            </summary>
            <div class="module-details-body">${body}</div>
          </details>
        ` : body}
      </section>
    `;
  }

  function renderWineShelfCard(wine) {
    return `
      <a class="shelf-card" href="#wine-${esc(wine.slug)}" aria-label="${esc(`${wine.name} の詳細を見る`)}">
        <div class="shelf-media">
          ${renderResponsiveImage(wine, "shelf-image")}
        </div>
        <div class="shelf-copy">
          <div class="shelf-kicker">${esc(wine.producer)}</div>
          <div class="shelf-title">${esc(wine.name)}</div>
          <div class="meta-row">
            ${[
              wine.flag || "",
              wine.country || "",
              wine.colorLabel || "",
              wine.vintage ? String(wine.vintage) : "NV",
            ].filter(Boolean).map((token) => `<span>${esc(token)}</span>`).join("")}
          </div>
          <div class="shelf-meters">
            <span>Pace ${esc(String(Math.round(wine.transforms.sound.bpm || 0)))}</span>
            <span>Energy ${esc(formatPercent(wine.transforms.sound.energy || 0))}</span>
            <span>Light ${esc(formatPercent(wine.transforms.light.brightness || 0))}</span>
          </div>
          <div class="shelf-footer">
            <span>${esc(wine.transforms.sound.primaryGenre || "signal")}</span>
            <strong>${esc(wine.price ? formatYen(wine.price) : `在庫 ${wine.quantity}`)}</strong>
            <em>詳細を見る</em>
          </div>
        </div>
      </a>
    `;
  }

  function renderWineDetail(wine) {
    const compact = isCompactViewport();
    const soundRows = [
      { label: "BPM", value: mapRange(wine.transforms.sound.bpm || 0, 80, 136, 0, 100), display: `${wine.transforms.sound.bpm}`, color: "#8fd0c5" },
      { label: "Energy", value: wine.transforms.sound.energy || 0, display: formatPercent(wine.transforms.sound.energy || 0), color: "#dd7e5d" },
      { label: "Dance", value: wine.transforms.sound.danceability || 0, display: formatPercent(wine.transforms.sound.danceability || 0), color: "#c9a067" },
      { label: "Density", value: wine.transforms.sound.density || 0, display: formatPercent(wine.transforms.sound.density || 0), color: "#9389bf" },
    ];
    const lightRows = [
      { label: "Brightness", value: wine.transforms.light.brightness || 0, display: formatPercent(wine.transforms.light.brightness || 0), color: "#d8dbc2" },
      { label: "Warmth", value: wine.transforms.light.warmth || 0, display: `${wine.transforms.light.colorTemperatureK}K`, color: "#d59263" },
      { label: "Contrast", value: wine.transforms.light.contrast || 0, display: formatPercent(wine.transforms.light.contrast || 0), color: "#84aec4" },
      { label: "Motion", value: wine.transforms.light.motion || 0, display: `${wine.transforms.light.pulseBpm} pulse`, color: "#8ad2cb" },
    ];
    const featureRows = [...(wine.features.vector || [])]
      .sort((left, right) => right.value - left.value)
      .slice(0, 6)
      .map((entry) => `
        <div class="feature-row"><span>${esc(entry.label)}</span><strong>${esc(formatPercent(entry.value))}</strong></div>
      `).join("");
    const spotifyRows = (wine.spotify?.tracks || []).map((entry) => `
      <div class="spotify-item">
        <div class="spotify-copy">
          <span class="spotify-role">${esc(entry.label)}</span>
          <strong>${esc(entry.title)} / ${esc(entry.artist)}</strong>
          <span class="spotify-reason">${esc(entry.reason)}</span>
        </div>
        <iframe
          class="spotify-embed"
          src="${esc(entry.embedUrl)}"
          title="${esc(`${wine.name} - ${entry.title}`)}"
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowfullscreen
          frameborder="0"
        ></iframe>
        <div class="chip-row">
          <a class="action-link" href="${esc(entry.url)}" target="_blank" rel="noreferrer">Open Track</a>
          <a class="action-link" href="${esc(entry.searchUrl)}" target="_blank" rel="noreferrer">Open Search</a>
        </div>
      </div>
    `).join("");

    const maybeFold = (title, body, open = false) => {
      if (!compact) {
        return `<section class="signal-panel"><div class="subsection-label">${esc(title)}</div>${body}</section>`;
      }
      return `
        <details class="signal-fold" ${open ? "open" : ""}>
          <summary class="signal-fold-summary">${esc(title)}</summary>
          <div class="signal-fold-body">${body}</div>
        </details>
      `;
    };

    return `
      <article id="wine-${esc(wine.slug)}" class="detail-card" style="--accent:${esc(wine.transforms.color.dominantHex)}; --gradient:${esc(wine.transforms.color.gradient)};">
        <div class="detail-media">
          ${renderResponsiveImage(wine, "detail-image")}
        </div>
        <div class="detail-copy">
          <div class="wine-head">
            <div>
              <div class="wine-kicker">${esc(wine.producer)}</div>
              <h3>${esc(wine.name)}</h3>
            </div>
            <div class="wine-qty">${esc(isAdminMode() ? `qty ${wine.quantity}` : `在庫 ${wine.quantity}`)}</div>
          </div>
          <div class="meta-row">
            ${[
              wine.flag || "",
              wine.country || "",
              wine.region || "",
              wine.colorLabel || "",
              wine.vintage ? String(wine.vintage) : "NV",
              wine.bottleMl ? `${wine.bottleMl}ml` : "",
              wine.abv ? `${wine.abv}%` : "",
              wine.price ? formatYen(wine.price) : "",
            ].filter(Boolean).map((token) => `<span>${esc(token)}</span>`).join("")}
          </div>
          <div class="gradient-strip" style="background:${esc(wine.transforms.color.gradient)}"></div>
          <div class="signal-grid">
            ${maybeFold("音", `
              <div class="genre-stack">
                <strong>${esc(wine.transforms.sound.primaryGenre)}</strong>
                <span>${esc((wine.transforms.sound.supportingGenres || []).join(" / "))}</span>
              </div>
              ${renderMeters(soundRows)}
              <div class="chip-row">${(wine.transforms.sound.textures || []).map((entry) => `<span class="tag-chip">${esc(entry)}</span>`).join("")}</div>
            `, true)}
            ${maybeFold("光", `
              ${renderMeters(lightRows)}
              <div class="micro-note">${esc(wine.transforms.atmosphere.setting || "")}</div>
              <div class="chip-row">${(wine.transforms.atmosphere.moodTags || []).map((entry) => `<span class="tag-chip">${esc(entry)}</span>`).join("")}</div>
            `, true)}
            ${maybeFold("色", `
              ${renderPalette(wine.transforms.color.swatches || [])}
              <div class="chip-row">
                <span class="tag-chip">Brightness ${esc(formatPercent(wine.transforms.color.brightness || 0))}</span>
                <span class="tag-chip">Warmth ${esc(formatPercent(wine.transforms.color.warmth || 0))}</span>
                <span class="tag-chip">Saturation ${esc(formatPercent(wine.transforms.color.saturation || 0))}</span>
              </div>
            `)}
            ${maybeFold("特徴", `
              <div class="chip-row">${(wine.features.dominantTraits || []).map((entry) => `<span class="tag-chip">${esc(entry.label)}</span>`).join("")}</div>
              <div class="feature-list">${featureRows}</div>
              <div class="micro-note">${esc(wine.signal.context.rationale || "")}</div>
            `)}
            ${maybeFold("音楽", `
              <div class="micro-note">${esc(wine.spotify?.summary || "")}</div>
              <div class="spotify-list">${spotifyRows}</div>
            `)}
          </div>
          <div class="chip-row">
            ${(wine.grapes || []).slice(0, 4).map((grape) => `<span class="tag-chip">${esc(grape)}</span>`).join("")}
            <span class="tag-chip">Farming ${esc(wine.farmingLabel)}</span>
            <span class="tag-chip">Filtration ${esc(wine.filtration)}</span>
          </div>
          <p class="note">${esc(excerpt(wine.notes || wine.inventoryNotes || "", 360))}</p>
          <div class="related-row">
            <div class="subsection-label">似たワイン</div>
            <div class="related-list">${(wine.relatedWines || []).map((entry) => `<span>${esc(`${entry.name} (${entry.score})`)}</span>`).join("")}</div>
          </div>
          <div class="card-footer">
            <div class="micro-copy">${esc(isAdminMode() ? `UMAP ${wine.embedding ? `${wine.embedding.x3d}, ${wine.embedding.y3d}, ${wine.embedding.z3d}` : "0, 0, 0"}` : "ワイン同士の距離感をマップ上で確認できます。")}</div>
            ${isAdminMode() ? `<button type="button" class="micro-action secondary-button" data-copy-wine="${esc(wine.id)}">Copy wine JSON</button>` : ""}
          </div>
        </div>
      </article>
    `;
  }

  function renderFilterSidebar(payload, filteredWines, filterModel) {
    const body = `
        <div class="filter-head">
          <div>
            <div class="section-label">絞り込み</div>
            <h2>${esc(filteredWines.length)} / ${esc(payload.totalWines)}本</h2>
          </div>
          <button type="button" class="micro-action secondary-button" data-clear-filters>クリア</button>
        </div>
        <div class="filter-stack">
          <div class="field-group">
            <label class="subsection-label" for="filter-query">検索</label>
            <input id="filter-query" type="text" value="${esc(state.filters.query)}" placeholder="ワイン名 / 生産者 / 品種 / 雰囲気" data-filter-field="query">
          </div>
          <div class="field-group">
            <label class="subsection-label" for="filter-color">色</label>
            <select id="filter-color" data-filter-field="color">
              <option value="">すべて</option>
              ${filterModel.colors.map((value) => `<option value="${esc(value)}" ${state.filters.color === value ? "selected" : ""}>${esc(value)}</option>`).join("")}
            </select>
          </div>
          <div class="field-group">
            <label class="subsection-label" for="filter-country">国</label>
            <select id="filter-country" data-filter-field="country">
              <option value="">すべて</option>
              ${filterModel.countries.map((value) => `<option value="${esc(value)}" ${state.filters.country === value ? "selected" : ""}>${esc(value)}</option>`).join("")}
            </select>
          </div>
          <div class="field-group">
            <label class="subsection-label" for="filter-genre">音楽の軸</label>
            <select id="filter-genre" data-filter-field="genre">
              <option value="">すべて</option>
              ${filterModel.genres.map((value) => `<option value="${esc(value)}" ${state.filters.genre === value ? "selected" : ""}>${esc(value)}</option>`).join("")}
            </select>
          </div>
          <div class="field-group">
            <label class="subsection-label" for="filter-farming">栽培方法</label>
            <select id="filter-farming" data-filter-field="farming">
              <option value="">すべて</option>
              ${filterModel.farming.map((value) => `<option value="${esc(value)}" ${state.filters.farming === value ? "selected" : ""}>${esc(value)}</option>`).join("")}
            </select>
          </div>
          <div class="field-group">
            <label class="subsection-label" for="filter-sort">並び順</label>
            <select id="filter-sort" data-filter-field="sort">
              <option value="name" ${state.filters.sort === "name" ? "selected" : ""}>ワイン名</option>
              <option value="producer" ${state.filters.sort === "producer" ? "selected" : ""}>生産者</option>
              <option value="priceAsc" ${state.filters.sort === "priceAsc" ? "selected" : ""}>価格が低い順</option>
              <option value="priceDesc" ${state.filters.sort === "priceDesc" ? "selected" : ""}>価格が高い順</option>
              <option value="vintageDesc" ${state.filters.sort === "vintageDesc" ? "selected" : ""}>新しいヴィンテージ順</option>
              <option value="bpmDesc" ${state.filters.sort === "bpmDesc" ? "selected" : ""}>テンポが高い順</option>
            </select>
          </div>
        </div>
    `;

    if (!isTabletViewport()) {
      return `<aside class="filter-sidebar">${body}</aside>`;
    }

    return `
      <aside class="filter-sidebar compact-filter-sidebar">
        <details class="module-details" ${state.filtersOpen ? "open" : ""} data-filters-details>
          <summary class="module-summary">
            <span class="section-label">絞り込み</span>
            <strong>${esc(filteredWines.length)} / ${esc(payload.totalWines)}本</strong>
          </summary>
          <div class="module-details-body">${body}</div>
        </details>
      </aside>
    `;
  }

  function renderCollection(payload) {
    const filterModel = buildFilterModel(payload);
    const filteredWines = filterWines(payload);

    return `
      <section id="catalog" class="module-panel catalog-panel">
        <div class="panel-head">
          <div>
            <div class="section-label">店内セレクション</div>
            <h2>店内セレクション</h2>
          </div>
          <div class="micro-copy">気分や味わいから、お好みの一本を探せます。</div>
        </div>
        <div class="catalog-shell">
          ${renderFilterSidebar(payload, filteredWines, filterModel)}
          <div class="catalog-stage">
            <div class="catalog-summary">
              <div class="micro-copy">${esc(filteredWines.length)}本のワインを表示しています。</div>
              <div class="chip-row">
                ${state.filters.query ? `<span class="tag-chip">検索: ${esc(state.filters.query)}</span>` : ""}
                ${state.filters.color ? `<span class="tag-chip">${esc(state.filters.color)}</span>` : ""}
                ${state.filters.country ? `<span class="tag-chip">${esc(state.filters.country)}</span>` : ""}
                ${state.filters.genre ? `<span class="tag-chip">${esc(state.filters.genre)}</span>` : ""}
                ${state.filters.farming ? `<span class="tag-chip">${esc(state.filters.farming)}</span>` : ""}
              </div>
            </div>
            <div class="catalog-grid">
              ${filteredWines.length
                ? filteredWines.map((wine) => renderWineShelfCard(wine)).join("")
                : `<div class="empty-state">No wines matched the current filters.</div>`}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderWineDetailPage(wine) {
    return `
      <section class="module-panel detail-page">
        <div class="panel-head">
          <div>
            <div class="section-label">ワイン詳細</div>
            <h2>${esc(wine.name)}</h2>
          </div>
          <div class="action-row">
            <a class="action-link secondary-button" href="#catalog">一覧に戻る</a>
          </div>
        </div>
        ${renderWineDetail(wine)}
      </section>
    `;
  }

  function renderStoreConsole() {
    const previewFront = state.previews.front ? `<img src="${esc(state.previews.front)}" alt="front preview" class="image-thumb">` : "";
    const previewBack = state.previews.back ? `<img src="${esc(state.previews.back)}" alt="back preview" class="image-thumb">` : "";
    const pairReady = Boolean(state.selectedFiles.front && state.selectedFiles.back);
    return `
      <section class="module-panel console-panel">
        <div class="store-console-head">
          <div>
            <div class="section-label">Ingest Console</div>
            <h2>表面 / 裏面 upload から自動追加</h2>
          </div>
          <div class="micro-copy">2枚1組で upload して、確認ボタンを押すと OCR → 特定 → database 更新 → UMAP 再計算 → webpage 更新まで進みます。</div>
        </div>
        <div class="console-grid">
          <div class="api-grid">
            <div class="field-group">
              <label class="subsection-label" for="api-base-input">API Base URL</label>
              <input id="api-base-input" type="text" value="${esc(state.apiBase)}" placeholder="https://your-api.example.com or http://localhost:8787">
            </div>
            <div class="action-row">
              <button type="button" class="action-button" data-save-api>Save API</button>
              <button type="button" class="micro-action secondary-button" data-refresh-live>Refresh Live Dataset</button>
              <button type="button" class="micro-action secondary-button" data-logout>Lock Page</button>
            </div>
            <div class="status-line">
              API status: ${esc(state.apiConnected ? "connected" : "static-only")} ${state.apiMessage ? `· ${esc(state.apiMessage)}` : ""}
            </div>
            <div class="micro-note">For secure writeback from the public page, use an HTTPS API endpoint. GitHub Pages itself cannot update the repository database.</div>
            <div class="micro-note">公開ページでは front / back の2枚ペアが必須です。処理後は現在のページ表示を自動更新し、API 側の live dataset にも反映します。</div>
            ${state.ingestResult ? `
              <div class="narrative-block">
                Last ingest: ${esc(state.ingestResult.matchedWine?.name || "unmatched")} · confidence ${esc(state.ingestResult.confidence || "unknown")} · ${state.ingestResult.provisionalCreated ? "provisional catalog created" : "matched existing catalog"}
              </div>
            ` : ""}
          </div>
          <form class="upload-grid" data-ingest-form>
            <div class="input-grid">
              <div class="field-group">
                <label class="subsection-label" for="location-input">Location</label>
                <input id="location-input" name="location" type="text" value="${esc(state.draft.location || state.payload?.location || "店内")}" data-draft-field="location">
              </div>
              <div class="field-group">
                <label class="subsection-label" for="quantity-input">Quantity</label>
                <input id="quantity-input" name="quantity" type="number" min="1" value="${esc(state.draft.quantity || 1)}" data-draft-field="quantity">
              </div>
            </div>
            <div class="field-group">
              <label class="subsection-label" for="notes-input">Notes</label>
              <textarea id="notes-input" name="notes" placeholder="Optional note about this bottle." data-draft-field="notes">${esc(state.draft.notes || "")}</textarea>
            </div>
            <div class="input-grid">
              <div class="upload-drop">
                <div class="subsection-label">Front Label 1/2</div>
                <input type="file" accept="image/*" name="frontImage" data-file-front>
                ${previewFront}
                <div class="micro-note">${esc(state.selectedFiles.front?.name || "表面ラベル画像を選択")}</div>
              </div>
              <div class="upload-drop">
                <div class="subsection-label">Back Label 2/2</div>
                <input type="file" accept="image/*" name="backImage" data-file-back>
                ${previewBack}
                <div class="micro-note">${esc(state.selectedFiles.back?.name || "裏面ラベル画像を選択")}</div>
              </div>
            </div>
            <div class="narrative-block">
              Pair status: ${pairReady ? "ready" : "waiting for 2 images"} · ${esc(state.selectedFiles.front?.name || "front missing")} / ${esc(state.selectedFiles.back?.name || "back missing")}
            </div>
            <div class="action-row">
              <button type="submit" class="action-button" ${(state.apiBase && pairReady) ? "" : "disabled"}>2枚を確認して処理を実行</button>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  function renderPayload(payload) {
    const routeWine = findRouteWine(payload);
    const title = isAdminMode() ? "店内ワイン 管理・登録" : "店内ワインリスト";
    const eyebrow = isAdminMode()
      ? "VIN NATUREL OS — ADMIN / INGEST"
      : "FIL TOKYO CELLAR";
    const heroCopy = isAdminMode()
      ? "表面と裏面の 2 枚 upload から OCR・自動照合・database 追加・音/光/色生成・UMAP 再計算までを実行する管理画面です。"
      : "店内にあるワインを、味わいの印象や雰囲気から眺められるページです。音・光・色のイメージとあわせて、それぞれの個性を楽しめます。";
    const primaryActions = isAdminMode()
      ? `
          <a class="action-link" href="${esc(publicPath)}">公開ページを見る</a>
          <a class="action-link" href="${esc(payloadPath)}" download>JSONを保存</a>
          <button type="button" class="action-button" data-copy-json>JSONをコピー</button>
          <button type="button" class="action-button secondary-button" data-share-json>JSONを共有</button>
        `
      : `<a class="action-link" href="#embeddings">ワインマップを見る</a>`;
    const statusBanner = state.error
      ? `<div class="status-banner error"><div class="status-copy">Error</div><div class="status-line">${esc(state.error)}</div></div>`
      : (isAdminMode() && state.status)
        ? `<div class="status-banner"><div class="status-copy">Status</div><div class="status-line">${esc(state.status)}</div></div>`
        : "";

    return `
      <div class="page-shell">
        <section class="hero">
          <div class="hero-top">
            <div>
              <div class="eyebrow">${esc(eyebrow)}</div>
              <h1>${esc(title)}</h1>
            </div>
            <div class="action-row">
              ${primaryActions}
            </div>
          </div>
          <div class="hero-copy">${esc(heroCopy)}</div>
          ${isAdminMode() ? `
            <div class="transport-copy">
              <span>Global <code>${esc(payload.transport.globalKey)}</code></span>
              <span>Event <code>${esc(payload.transport.eventName)}</code></span>
              <span>Schema <code>${esc(payload.schema)}</code></span>
              <span>Mode <code>${esc(pageMode)}</code></span>
            </div>
          ` : ""}
        </section>

        ${statusBanner}

        <section class="stats module-panel">
          <div><div class="stat-label">場所</div><div class="stat-value">${esc(payload.location)}</div></div>
          <div><div class="stat-label">ワイン数</div><div class="stat-value">${esc(payload.totalWines)}</div></div>
          <div><div class="stat-label">本数</div><div class="stat-value">${esc(payload.totalBottles)}</div></div>
          <div><div class="stat-label">更新日</div><div class="stat-value">${esc(new Date(payload.generatedAt).toLocaleDateString("ja-JP"))}</div></div>
        </section>

        <div class="module-stack">
          ${isAdminMode() ? renderStoreConsole() : ""}
          ${routeWine ? renderWineDetailPage(routeWine) : `
            ${renderCollection(payload)}
            ${renderStoreProfile(payload.storeProfile || {})}
            ${renderEmbedding(payload)}
          `}
        </div>

        <footer class="footer">
          <div class="footer-copy">${esc(isAdminMode() ? `Generated at ${payload.generatedAt}` : `更新: ${new Date(payload.generatedAt).toLocaleDateString("ja-JP")}`)}</div>
          <div class="action-row">
            ${isAdminMode() ? `<a class="action-link" href="${esc(payloadPath)}">JSONを見る</a>` : ""}
            ${isAdminMode() ? `<a class="action-link" href="${esc(publicPath)}">公開ページ</a>` : ""}
            <a class="action-link" href="#embeddings">ワインマップへ</a>
          </div>
        </footer>
      </div>
    `;
  }

  async function copyText(text, success) {
    await navigator.clipboard.writeText(text);
    state.status = success;
    state.error = "";
    render();
  }

  async function shareJson(json) {
    if (navigator.share) {
      await navigator.share({ title: "Store signal bundle", text: json });
      state.status = "JSON shared.";
      state.error = "";
      render();
      return;
    }
    await copyText(json, "JSON copied.");
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      let message = `Request failed: ${response.status}`;
      try {
        const payload = await response.json();
        message = payload.error || message;
      } catch {
        // Ignore parse error.
      }
      throw new Error(message);
    }
    return response.json();
  }

  function buildApiUrl(path) {
    if (!state.apiBase || usesSameOriginApi()) return path;
    return new URL(path, state.apiBase).toString();
  }

  function buildAdminHeaders() {
    if (!isAdminMode() || !state.adminToken) {
      return {};
    }

    return {
      "x-store-admin-token": state.adminToken,
    };
  }

  function revokePreview(side) {
    const preview = state.previews[side];
    if (preview?.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }
  }

  async function loadStaticPayload() {
    state.payload = await fetchJson(payloadPath);
    window[state.payload.transport.globalKey] = state.payload;
    window.dispatchEvent(new CustomEvent(state.payload.transport.eventName, { detail: state.payload }));
  }

  async function refreshLiveDataset() {
    if (!hasLiveApi()) {
      state.apiConnected = false;
      state.apiMessage = "API base not configured";
      render();
      return;
    }

    try {
      const payload = await fetchJson(buildApiUrl(`/api/store/dataset?location=${encodeURIComponent("店内")}`));
      state.payload = payload;
      state.apiConnected = true;
      state.apiMessage = "live dataset loaded";
      state.status = "Live dataset refreshed.";
      state.error = "";
      window[payload.transport.globalKey] = payload;
      window.dispatchEvent(new CustomEvent(payload.transport.eventName, { detail: payload }));
      render();
    } catch (error) {
      state.apiConnected = false;
      state.apiMessage = error.message;
      state.error = error.message;
      render();
    }
  }

  function handleFilePreview(event, side) {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      revokePreview(side);
      state.previews[side] = "";
      state.selectedFiles[side] = null;
      render();
      return;
    }
    revokePreview(side);
    const url = URL.createObjectURL(file);
    state.selectedFiles[side] = file;
    state.previews[side] = url;
    render();
  }

  function handleDraftField(event) {
    const field = event.currentTarget.dataset.draftField;
    if (!field) return;
    const value = field === "quantity"
      ? Math.max(1, Number(event.currentTarget.value || 1) || 1)
      : event.currentTarget.value;
    state.draft[field] = value;
  }

  function handleFilterField(event) {
    const field = event.currentTarget.dataset.filterField;
    if (!field) return;
    state.filters[field] = event.currentTarget.value;
    render();
  }

  async function handleIngestSubmit(event) {
    event.preventDefault();
    if (!hasLiveApi()) {
      state.error = "Configure an API base before uploading.";
      render();
      return;
    }

    const frontImage = state.selectedFiles.front;
    const backImage = state.selectedFiles.back;

    if (!frontImage || !backImage) {
      state.error = "Front and back label images are required.";
      render();
      return;
    }

    const formData = new FormData();
    formData.set("location", String(state.draft.location || state.payload?.location || "店内"));
    formData.set("quantity", String(state.draft.quantity || 1));
    formData.set("notes", String(state.draft.notes || ""));
    formData.set("frontImage", frontImage);
    formData.set("backImage", backImage);
    state.status = "Uploading bottle pair, OCR in progress…";
    state.error = "";
    render();

    try {
      const result = await fetchJson(buildApiUrl("/api/store/ingest-bottle"), {
        method: "POST",
        headers: buildAdminHeaders(),
        body: formData,
      });

      if (result.dataset) {
        finalizeIngestResult(result);
        return;
      }

      if (!result.jobId) {
        throw new Error("Ingest response did not return dataset or jobId.");
      }

      state.ingestJobId = result.jobId;
      state.ingestJobStatus = result.status || "queued";
      state.status = "Upload finished. OCR, matching, database update, and UMAP rebuild are running…";
      render();

      const completed = await waitForIngestJob(result.jobId);
      finalizeIngestResult(completed);
    } catch (error) {
      state.error = error.message;
      state.status = "";
      render();
    }
  }

  function finalizeIngestResult(result) {
    state.ingestResult = result;
    state.payload = result.dataset;
    state.apiConnected = true;
    state.apiMessage = "writeback succeeded";
    state.ingestJobId = result.job?.id || "";
    state.ingestJobStatus = result.job?.status || "completed";
    state.status = `Bottle added: ${result.matchedWine?.name || "unidentified"} (${result.confidence || "unknown"}). OCR, matching, database update, UMAP re-embed, and webpage refresh completed.`;
    state.error = "";
    revokePreview("front");
    revokePreview("back");
    state.previews.front = "";
    state.previews.back = "";
    state.selectedFiles.front = null;
    state.selectedFiles.back = null;
    state.draft.quantity = 1;
    state.draft.notes = "";
    state.draft.location = result.location || state.draft.location || "店内";
    window[result.dataset.transport.globalKey] = result.dataset;
    window.dispatchEvent(new CustomEvent(result.dataset.transport.eventName, { detail: result.dataset }));
    render();
  }

  async function waitForIngestJob(jobId) {
    const deadline = Date.now() + 180000;

    while (Date.now() < deadline) {
      const result = await fetchJson(buildApiUrl(`/api/store/jobs/${encodeURIComponent(jobId)}`), {
        headers: buildAdminHeaders(),
      });

      state.ingestJobStatus = result.job?.status || "";
      if (result.job?.status === "completed" && result.dataset) {
        return result;
      }

      if (result.job?.status === "failed") {
        throw new Error(result.job?.errorMessage || "Bottle processing failed.");
      }

      state.status = `Processing bottle pair… ${result.job?.status || "queued"}`;
      render();
      await new Promise((resolve) => window.setTimeout(resolve, 1800));
    }

    throw new Error("Bottle processing timed out.");
  }

  function setup3dCanvas() {
    const canvas = document.querySelector("[data-embedding-canvas]");
    const toggle = document.querySelector("[data-toggle-rotation]");
    if (!canvas || !state.payload?.embedding?.points?.length) return;

    if (state.animationFrame) {
      cancelAnimationFrame(state.animationFrame);
      state.animationFrame = 0;
    }

    const context = canvas.getContext("2d");
    const points = state.payload.embedding.points;
    const axes = state.payload.embedding.axes || [];
    let yaw = 0.72;
    let pitch = -0.38;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(320, Math.round(rect.width * dpr));
      canvas.height = Math.max(320, Math.round(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const project = (point, localYaw, localPitch, width, height) => {
      const cosY = Math.cos(localYaw);
      const sinY = Math.sin(localYaw);
      const cosX = Math.cos(localPitch);
      const sinX = Math.sin(localPitch);
      const x1 = point.x3d * cosY - point.z3d * sinY;
      const z1 = point.x3d * sinY + point.z3d * cosY;
      const y1 = point.y3d * cosX - z1 * sinX;
      const z2 = point.y3d * sinX + z1 * cosX;
      const depth = 3.2 + z2;
      const scale = 0.82 / depth;

      return {
        x: width / 2 + x1 * width * 0.25 * scale,
        y: height / 2 - y1 * height * 0.25 * scale,
        z: z2,
        scale,
      };
    };

    const drawAxes = (width, height) => {
      const basis = [
        { vector: { x3d: 1, y3d: 0, z3d: 0 }, color: "#87b9d1", label: axes[0]?.id?.toUpperCase() || "UMAP-X" },
        { vector: { x3d: 0, y3d: 1, z3d: 0 }, color: "#d69263", label: axes[1]?.id?.toUpperCase() || "UMAP-Y" },
        { vector: { x3d: 0, y3d: 0, z3d: 1 }, color: "#9ccfbe", label: axes[2]?.id?.toUpperCase() || "UMAP-Z" },
      ];

      for (const axis of basis) {
        const origin = project({ x3d: 0, y3d: 0, z3d: 0 }, yaw, pitch, width, height);
        const edge = project(axis.vector, yaw, pitch, width, height);
        context.strokeStyle = axis.color;
        context.lineWidth = 1.2;
        context.beginPath();
        context.moveTo(origin.x, origin.y);
        context.lineTo(edge.x, edge.y);
        context.stroke();
        context.fillStyle = axis.color;
        context.font = "11px IBM Plex Mono, monospace";
        context.fillText(axis.label, edge.x + 6, edge.y - 6);
      }
    };

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "rgba(7, 12, 18, 0.92)";
      context.fillRect(0, 0, width, height);
      drawAxes(width, height);

      const projected = points.map((point) => ({
        point,
        projected: project(point, yaw, pitch, width, height),
      })).sort((left, right) => left.projected.z - right.projected.z);

      for (const item of projected) {
        const radius = 9 + item.projected.scale * 14;
        context.beginPath();
        context.fillStyle = item.point.accentHex;
        context.strokeStyle = "rgba(255,255,255,0.7)";
        context.lineWidth = 1.2;
        context.arc(item.projected.x, item.projected.y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = "#071018";
        context.font = "bold 11px IBM Plex Mono, monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(String(item.point.index), item.projected.x, item.projected.y + 0.5);
        context.fillStyle = "rgba(226,236,239,0.92)";
        context.textAlign = "left";
        context.textBaseline = "alphabetic";
        context.font = "11px IBM Plex Mono, monospace";
        context.fillText(item.point.name, item.projected.x + radius + 6, item.projected.y - radius - 4);
      }
    };

    const loop = () => {
      if (state.rotationEnabled) {
        yaw += 0.0032;
      }
      draw();
      state.animationFrame = requestAnimationFrame(loop);
    };

    toggle?.addEventListener("click", () => {
      state.rotationEnabled = !state.rotationEnabled;
      toggle.textContent = state.rotationEnabled ? "Pause rotation" : "Resume rotation";
    });

    window.addEventListener("resize", resize, { once: true });
    resize();
    loop();
  }

  function bindEvents() {
    document.querySelector("[data-copy-json]")?.addEventListener("click", async () => {
      try {
        await copyText(JSON.stringify(state.payload, null, 2), "Store JSON copied.");
      } catch (error) {
        state.error = error.message;
        render();
      }
    });

    document.querySelector("[data-share-json]")?.addEventListener("click", async () => {
      try {
        await shareJson(JSON.stringify(state.payload, null, 2));
      } catch (error) {
        state.error = error.message;
        render();
      }
    });

    if (isAdminMode()) {
      document.querySelector("[data-save-api]")?.addEventListener("click", () => {
        const value = document.querySelector("#api-base-input")?.value?.trim() || "";
        state.apiBase = value;
        localStorage.setItem(apiStorageKey, value);
        state.status = value ? "API base saved." : "API base cleared.";
        state.error = "";
        render();
        if (value) {
          void refreshLiveDataset();
        }
      });

      document.querySelector("[data-refresh-live]")?.addEventListener("click", () => {
        void refreshLiveDataset();
      });

      document.querySelector("[data-logout]")?.addEventListener("click", () => {
        sessionStorage.removeItem(sessionKey);
        state.unlocked = false;
        renderPasswordGate();
      });

      document.querySelector("[data-ingest-form]")?.addEventListener("submit", handleIngestSubmit);
      document.querySelector("[data-file-front]")?.addEventListener("change", (event) => handleFilePreview(event, "front"));
      document.querySelector("[data-file-back]")?.addEventListener("change", (event) => handleFilePreview(event, "back"));
      document.querySelectorAll("[data-draft-field]").forEach((input) => {
        input.addEventListener("input", handleDraftField);
        input.addEventListener("change", handleDraftField);
      });
    }

    document.querySelectorAll("[data-copy-wine]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        const wine = (state.payload?.wines || []).find((entry) => entry.id === event.currentTarget.dataset.copyWine);
        if (!wine) return;
        try {
          await copyText(JSON.stringify(wine, null, 2), "Wine JSON copied.");
        } catch (error) {
          state.error = error.message;
          render();
        }
      });
    });

    document.querySelectorAll("[data-filter-field]").forEach((input) => {
      input.addEventListener("input", handleFilterField);
      input.addEventListener("change", handleFilterField);
    });

    document.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
      state.filters = {
        query: "",
        color: "",
        country: "",
        genre: "",
        farming: "",
        sort: "name",
      };
      render();
    });

    document.querySelector("[data-filters-details]")?.addEventListener("toggle", (event) => {
      state.filtersOpen = Boolean(event.currentTarget.open);
    });

    setup3dCanvas();
  }

  function render() {
    if (!root || !state.payload || !state.unlocked) return;
    root.innerHTML = renderPayload(state.payload);
    bindEvents();
  }

  async function hashPassword(password) {
    const salt = config.password?.salt || "";
    const encoded = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  function renderPasswordGate(message = "") {
    if (!requiresAuth) return;
    if (!overlay) return;
    overlay.classList.remove("hidden");
    overlay.innerHTML = `
      <div class="password-panel">
        <div>
          <div class="eyebrow">Protected Access</div>
          <h2>Store Signal Dashboard</h2>
        </div>
        <div class="status-line">GitHub Pages cannot enforce server-side auth. This page uses a client-side password gate.</div>
        <div class="field-group">
          <label class="subsection-label" for="store-password">Password</label>
          <input id="store-password" class="password-input" type="password" placeholder="${esc(config.password?.hint || "shared password")}">
        </div>
        ${message ? `<div class="status-line">${esc(message)}</div>` : ""}
        <div class="action-row">
          <button type="button" class="action-button" data-password-submit>${state.passwordBusy ? "Checking…" : "Unlock"}</button>
        </div>
      </div>
    `;

    overlay.querySelector("[data-password-submit]")?.addEventListener("click", async () => {
      const value = overlay.querySelector("#store-password")?.value || "";
      state.passwordBusy = true;
      renderPasswordGate("Checking password…");
      const digest = await hashPassword(value);
      if (digest === config.password?.hash) {
        state.unlocked = true;
        state.passwordBusy = false;
        state.adminToken = value;
        sessionStorage.setItem(sessionKey, "ok");
        sessionStorage.setItem(adminTokenKey, value);
        overlay.classList.add("hidden");
        render();
        if (hasLiveApi()) {
          void refreshLiveDataset();
        }
        return;
      }
      state.adminToken = "";
      sessionStorage.removeItem(adminTokenKey);
      state.passwordBusy = false;
      renderPasswordGate("Password mismatch.");
    });
  }

  async function init() {
    const queryApi = new URLSearchParams(window.location.search).get("api") || "";
    state.apiBase = queryApi || localStorage.getItem(apiStorageKey) || defaultApiBase || "";
    state.adminToken = sessionStorage.getItem(adminTokenKey) || "";
    await loadStaticPayload();
    state.draft.location = state.payload?.location || state.draft.location || "店内";
    state.filtersOpen = !isTabletViewport();
    state.unlocked = !requiresAuth || (sessionStorage.getItem(sessionKey) === "ok" && Boolean(state.adminToken));

    if (!state.unlocked) {
      renderPasswordGate();
      return;
    }

    render();
    if (hasLiveApi()) {
      await refreshLiveDataset();
    }
  }

  window.addEventListener("hashchange", () => {
    render();
  });

  void init();
}());
