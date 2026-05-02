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
    ingestResult: null,
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
  };

  const config = window.__STORE_PAGE_CONFIG__ || {};
  const root = document.querySelector("[data-store-app]");
  const overlay = document.querySelector("[data-password-overlay]");
  const pageMode = config.mode === "admin" ? "admin" : "public";
  const requiresAuth = pageMode === "admin" && Boolean(config.password?.hash);
  const sessionKey = config.password?.storageKey || "natural-wine-store-pages";
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

  function isAdminMode() {
    return pageMode === "admin";
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

    return `
      <section class="module-panel dna-panel">
        <div class="panel-head">
          <div>
            <div class="section-label">Store DNA</div>
            <h2>店内ワインの特徴抽出</h2>
          </div>
          <div class="micro-copy">Color, sound, light, and semantic traits are fused into one live store manifold.</div>
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
      </section>
    `;
  }

  function renderEmbedding(payload) {
    return `
      <section class="module-panel embed-panel" id="embeddings">
        <div class="panel-head">
          <div>
            <div class="section-label">Embedding Field</div>
            <h2>2D / 3D UMAP 埋め込み可視化</h2>
          </div>
          <div class="micro-copy">Method: ${(payload.embedding?.method || "umap-js-v1")} over ${(payload.embedding?.featureOrder || []).length} extracted parameters.</div>
        </div>
        <div class="embed-grid">
          <div class="embed-card">
            <div class="subsection-label">2D UMAP</div>
            ${createSvg2d(payload.embedding || { points: [], axes: [] })}
            ${renderLegend(payload.embedding?.points || [])}
          </div>
          <div class="embed-card">
            <div class="subsection-label">3D UMAP</div>
            <canvas class="embedding-canvas" data-embedding-canvas></canvas>
            <div class="action-row">
              <button type="button" class="micro-action secondary-button" data-toggle-rotation>Pause rotation</button>
            </div>
            ${renderLegend(payload.embedding?.points || [])}
          </div>
        </div>
        ${renderAxisCards(payload.embedding?.axes || [])}
      </section>
    `;
  }

  function renderWineCard(wine) {
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

    return `
      <article id="wine-${esc(wine.slug)}" class="wine-card" style="--accent:${esc(wine.transforms.color.dominantHex)}; --gradient:${esc(wine.transforms.color.gradient)};">
        <div class="wine-media">
          ${wine.imagePath
            ? `<img class="wine-image" src="${esc(wine.imagePath)}" alt="${esc(wine.name)}" loading="lazy" decoding="async">`
            : `<div class="wine-image wine-image-empty">NO IMAGE</div>`}
        </div>
        <div class="wine-copy">
          <div class="wine-head">
            <div>
              <div class="wine-kicker">${esc(wine.producer)}</div>
              <h3>${esc(wine.name)}</h3>
            </div>
            <div class="wine-qty">qty ${esc(wine.quantity)}</div>
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
            <section class="signal-panel">
              <div class="subsection-label">Sound</div>
              <div class="genre-stack">
                <strong>${esc(wine.transforms.sound.primaryGenre)}</strong>
                <span>${esc((wine.transforms.sound.supportingGenres || []).join(" / "))}</span>
              </div>
              ${renderMeters(soundRows)}
              <div class="chip-row">${(wine.transforms.sound.textures || []).map((entry) => `<span class="tag-chip">${esc(entry)}</span>`).join("")}</div>
            </section>
            <section class="signal-panel">
              <div class="subsection-label">Light</div>
              ${renderMeters(lightRows)}
              <div class="micro-note">${esc(wine.transforms.atmosphere.setting || "")}</div>
              <div class="chip-row">${(wine.transforms.atmosphere.moodTags || []).map((entry) => `<span class="tag-chip">${esc(entry)}</span>`).join("")}</div>
            </section>
            <section class="signal-panel">
              <div class="subsection-label">Color</div>
              ${renderPalette(wine.transforms.color.swatches || [])}
              <div class="chip-row">
                <span class="tag-chip">Brightness ${esc(formatPercent(wine.transforms.color.brightness || 0))}</span>
                <span class="tag-chip">Warmth ${esc(formatPercent(wine.transforms.color.warmth || 0))}</span>
                <span class="tag-chip">Saturation ${esc(formatPercent(wine.transforms.color.saturation || 0))}</span>
              </div>
            </section>
            <section class="signal-panel">
              <div class="subsection-label">Feature Extract</div>
              <div class="chip-row">${(wine.features.dominantTraits || []).map((entry) => `<span class="tag-chip">${esc(entry.label)}</span>`).join("")}</div>
              <div class="feature-list">${featureRows}</div>
              <div class="micro-note">${esc(wine.signal.context.rationale || "")}</div>
            </section>
          </div>
          <div class="chip-row">
            ${(wine.grapes || []).slice(0, 4).map((grape) => `<span class="tag-chip">${esc(grape)}</span>`).join("")}
            <span class="tag-chip">Farming ${esc(wine.farmingLabel)}</span>
            <span class="tag-chip">Filtration ${esc(wine.filtration)}</span>
          </div>
          <p class="note">${esc(excerpt(wine.notes || wine.inventoryNotes || "", 360))}</p>
          <div class="related-row">
            <div class="subsection-label">Related Wines</div>
            <div class="related-list">${(wine.relatedWines || []).map((entry) => `<span>${esc(`${entry.name} (${entry.score})`)}</span>`).join("")}</div>
          </div>
          <div class="card-footer">
            <div class="micro-copy">UMAP ${wine.embedding ? `${wine.embedding.x3d}, ${wine.embedding.y3d}, ${wine.embedding.z3d}` : "0, 0, 0"}</div>
            <button type="button" class="micro-action secondary-button" data-copy-wine="${esc(wine.id)}">Copy wine JSON</button>
          </div>
        </div>
      </article>
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
    const title = isAdminMode() ? "店内ワイン 管理・登録" : "店内ワインリスト";
    const eyebrow = isAdminMode()
      ? "VIN NATUREL OS — ADMIN / INGEST"
      : "VIN NATUREL OS — PUBLIC STORE SIGNAL FIELD";
    const heroCopy = isAdminMode()
      ? "表面と裏面の 2 枚 upload から OCR・自動照合・database 追加・音/光/色生成・UMAP 再計算までを実行する管理画面です。"
      : "店内にあるワインを、音・光・色へ変換し、特徴量ベクトルから UMAP を計算して 2D / 3D に埋め込んだ公開画面です。";
    const primaryActions = isAdminMode()
      ? `
          <a class="action-link" href="${esc(publicPath)}">Open Public Page</a>
          <a class="action-link" href="${esc(payloadPath)}" download>Download JSON</a>
          <button type="button" class="action-button" data-copy-json>Copy JSON</button>
          <button type="button" class="action-button secondary-button" data-share-json>Share JSON</button>
        `
      : `
          <a class="action-link" href="${esc(adminPath)}">Open Admin Page</a>
          <a class="action-link" href="${esc(payloadPath)}" download>Download JSON</a>
          <button type="button" class="action-button" data-copy-json>Copy JSON</button>
          <button type="button" class="action-button secondary-button" data-share-json>Share JSON</button>
        `;
    const statusBanner = state.error
      ? `<div class="status-banner error"><div class="status-copy">Error</div><div class="status-line">${esc(state.error)}</div></div>`
      : state.status
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
          <div class="transport-copy">
            <span>Global <code>${esc(payload.transport.globalKey)}</code></span>
            <span>Event <code>${esc(payload.transport.eventName)}</code></span>
            <span>Schema <code>${esc(payload.schema)}</code></span>
            <span>Mode <code>${esc(pageMode)}</code></span>
          </div>
        </section>

        ${statusBanner}

        <section class="stats module-panel">
          <div><div class="stat-label">Location</div><div class="stat-value">${esc(payload.location)}</div></div>
          <div><div class="stat-label">Wines</div><div class="stat-value">${esc(payload.totalWines)}</div></div>
          <div><div class="stat-label">Bottles</div><div class="stat-value">${esc(payload.totalBottles)}</div></div>
          <div><div class="stat-label">Updated</div><div class="stat-value">${esc(new Date(payload.generatedAt).toLocaleDateString("ja-JP"))}</div></div>
        </section>

        <div class="module-stack">
          ${isAdminMode() ? renderStoreConsole() : ""}
          ${renderStoreProfile(payload.storeProfile || {})}
          ${renderEmbedding(payload)}
          <section class="module-panel wines-panel">
            <div class="panel-head">
              <div>
                <div class="section-label">Bottle Signals</div>
                <h2>各ワインの音・光・色パラメーター</h2>
              </div>
              <div class="micro-copy">All current in-store wines are processed with the same mapping pipeline.</div>
            </div>
            <div class="wine-grid">
              ${(payload.wines || []).map((wine) => renderWineCard(wine)).join("")}
            </div>
          </section>
        </div>

        <footer class="footer">
          <div class="footer-copy">Generated at ${esc(payload.generatedAt)}</div>
          <div class="action-row">
            <a class="action-link" href="${esc(payloadPath)}">Open JSON</a>
            <a class="action-link" href="${esc(isAdminMode() ? publicPath : adminPath)}">${isAdminMode() ? "Public Page" : "Admin Page"}</a>
            <a class="action-link" href="#embeddings">Jump to UMAP</a>
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
    if (!state.apiBase) return path;
    return new URL(path, state.apiBase).toString();
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
    if (!state.apiBase) {
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

  async function handleIngestSubmit(event) {
    event.preventDefault();
    if (!state.apiBase) {
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
        body: formData,
      });
      state.ingestResult = result;
      state.payload = result.dataset;
      state.apiConnected = true;
      state.apiMessage = "writeback succeeded";
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
    } catch (error) {
      state.error = error.message;
      state.status = "";
      render();
    }
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
        sessionStorage.setItem(sessionKey, "ok");
        overlay.classList.add("hidden");
        render();
        if (state.apiBase) {
          void refreshLiveDataset();
        }
        return;
      }
      state.passwordBusy = false;
      renderPasswordGate("Password mismatch.");
    });
  }

  async function init() {
    const queryApi = new URLSearchParams(window.location.search).get("api") || "";
    state.apiBase = queryApi || localStorage.getItem(apiStorageKey) || defaultApiBase || "";
    await loadStaticPayload();
    state.draft.location = state.payload?.location || state.draft.location || "店内";
    state.unlocked = !requiresAuth || sessionStorage.getItem(sessionKey) === "ok";

    if (!state.unlocked) {
      renderPasswordGate();
      return;
    }

    render();
    if (state.apiBase) {
      await refreshLiveDataset();
    }
  }

  void init();
}());
