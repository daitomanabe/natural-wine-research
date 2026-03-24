import { useEffect, useMemo, useState, useTransition } from "react";
import { BarChart } from "./components/BarChart";
import { ScatterPlot } from "./components/ScatterPlot";
import { WineDetail } from "./components/WineDetail";
import { COLOR_MAP, DB as SEED_DB, FARMING_MAP, FLAG_MAP } from "./data/wines";
import { getJson, postJson, uploadImage } from "./lib/api";

const EMPTY_STATS = {
  catalogCount: SEED_DB.length,
  inventoryCount: 0,
  inventoryLinked: 0,
  plottable: SEED_DB.filter((wine) => Number.isFinite(wine.so2) && Number.isFinite(wine.intervention)).length,
  labelReady: SEED_DB.filter((wine) => (wine.aliases?.length ?? 0) > 0 || (wine.labelText?.length ?? 0) > 0).length,
  labelAssets: 0,
  countries: [...new Set(SEED_DB.map((wine) => wine.country))].length,
  sourceWatchlist: [],
};

const INITIAL_INVENTORY_FORM = {
  location: "Studio Cellar",
  quantity: 1,
  notes: "",
};

const INITIAL_CATALOG_DRAFT = {
  name: "",
  producer: "",
  country: "FR",
  region: "",
  appellation: "",
  color: "white",
  styles: "",
  flavors: "",
  aliases: "",
  notes: "",
};

const INITIAL_LABEL_DRAFT = {
  displayName: "",
  dominantColors: "",
  motifs: "",
  typography: "",
  badgeText: "",
  notes: "",
};

const INITIAL_MANUAL_FORM = {
  mood: "",
  colors: [],
  countries: "",
  styles: "",
  flavors: "",
  maxPrice: 45,
  minNaturalness: 6,
};

const INITIAL_CONTEXT_FORM = {
  city: "Tokyo",
  headlineTopic: "natural wine culture",
  djNotes: "",
  styles: "",
  flavors: "",
  colors: [],
  maxPrice: 45,
};

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function RecommendationColumn({ title, items, onSelect, emptyLabel }) {
  return (
    <div className="recommend-column">
      <div className="section-label">{title}</div>
      <div className="recommend-grid">
        {items?.length ? items.map((item) => (
          <button key={`${title}-${item.wine.id}`} type="button" className="recommend-card" onClick={() => onSelect(item.wine)}>
            <div className="recommend-card-top">
              <span className="recommend-score">{item.score}</span>
              <span className="recommend-naturalness">
                {item.naturalness === null ? "N/A" : item.naturalness.toFixed(1)}
              </span>
            </div>
            <div className="recommend-title">{item.wine.name}</div>
            <div className="recommend-subtitle">{item.wine.producer}</div>
            <div className="recommend-meta">
              {item.wine.region} · {COLOR_MAP[item.wine.color]?.label ?? item.wine.color}
              {Number.isFinite(item.wine.price) ? ` · €${item.wine.price}` : ""}
            </div>
            <div className="recommend-reasons">{item.reasons.join(" · ")}</div>
            {item.inventoryItem ? (
              <div className="recommend-stock">
                Inventory: {item.inventoryItem.location || "Unknown"} · qty {item.inventoryItem.quantity}
              </div>
            ) : null}
          </button>
        )) : (
          <div className="empty-card">{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}

function SourceWatchlist({ sources, onRun, onRunAll, runningIds }) {
  return (
    <div className="watchlist-row">
      <div className="watchlist-head">
        <div className="section-label">GLOBAL SOURCE PIPELINE</div>
        <button type="button" className="secondary-button" onClick={onRunAll} disabled={Object.values(runningIds).some(Boolean)}>
          RUN ALL ENABLED
        </button>
      </div>
      {sources.map((source) => {
        const isRunning = runningIds[source.id];
        const status = source.status || "unknown";
        const lastRun = source.lastRunAt ? new Date(source.lastRunAt).toLocaleString("en-US") : "never";
        const enabledLabel = source.enabled === false ? "disabled" : "enabled";
        return (
          <div key={source.id} className="watchlist-item">
            <div className="watchlist-item-top">
              <div>
                <div className="watchlist-chip-title">{source.label}</div>
                <div className="watchlist-meta">
                  {source.type}/{source.coverage} · {enabledLabel} · status {status}
                </div>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onRun(source.id)}
                disabled={Boolean(isRunning) || source.enabled === false}
              >
                {isRunning ? "Running…" : "Run"}
              </button>
            </div>
            <div className="watchlist-meta">
              Last run: {lastRun}
            </div>
            <div className="watchlist-meta">
              {source.endpoint ? source.endpoint : "No endpoint configured"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [catalog, setCatalog] = useState(SEED_DB);
  const [inventory, setInventory] = useState([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [selected, setSelected] = useState(null);
  const [filterColor, setFilterColor] = useState(null);
  const [filterFarming, setFilterFarming] = useState(null);
  const [filterSo2Max, setFilterSo2Max] = useState(45);
  const [appError, setAppError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [sourceRunning, setSourceRunning] = useState({});
  const [isPending, startTransition] = useTransition();

  const [analysisFile, setAnalysisFile] = useState(null);
  const [analysisPreview, setAnalysisPreview] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisSelectionId, setAnalysisSelectionId] = useState("");
  const [inventoryForm, setInventoryForm] = useState(INITIAL_INVENTORY_FORM);
  const [catalogDraft, setCatalogDraft] = useState(INITIAL_CATALOG_DRAFT);
  const [labelDraft, setLabelDraft] = useState(INITIAL_LABEL_DRAFT);

  const [manualForm, setManualForm] = useState(INITIAL_MANUAL_FORM);
  const [manualRecommendations, setManualRecommendations] = useState(null);

  const [contextForm, setContextForm] = useState(INITIAL_CONTEXT_FORM);
  const [contextRecommendations, setContextRecommendations] = useState(null);

  useEffect(() => {
    if (!analysisFile) {
      setAnalysisPreview("");
      return undefined;
    }

    const url = URL.createObjectURL(analysisFile);
    setAnalysisPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [analysisFile]);

  async function refreshData() {
    try {
      const [catalogData, inventoryData, statsData] = await Promise.all([
        getJson("/api/catalog"),
        getJson("/api/inventory"),
        getJson("/api/stats"),
      ]);

      startTransition(() => {
        setCatalog(catalogData);
        setInventory(inventoryData);
        setStats(statsData);
      });
      setAppError("");
    } catch (error) {
      setAppError(`API unavailable. Showing seed catalog only. ${error.message}`);
    }
  }

  useEffect(() => {
    void refreshData();
  }, []);

  useEffect(() => {
    if (selected && !catalog.find((wine) => wine.id === selected.id)) {
      setSelected(null);
    }
  }, [catalog, selected]);

  const filtered = useMemo(() => catalog.filter((wine) => {
    if (filterColor && wine.color !== filterColor) return false;
    if (filterFarming && wine.farming !== filterFarming) return false;
    if (filterSo2Max < 45 && !Number.isFinite(wine.so2)) return false;
    if (Number.isFinite(wine.so2) && wine.so2 > filterSo2Max) return false;
    return true;
  }), [catalog, filterColor, filterFarming, filterSo2Max]);

  const plottable = filtered.filter((wine) => Number.isFinite(wine.so2) && Number.isFinite(wine.intervention));
  const avgSo2Known = filtered.filter((wine) => Number.isFinite(wine.so2));
  const avgPriceKnown = filtered.filter((wine) => Number.isFinite(wine.price));
  const avgSo2 = avgSo2Known.length ? (avgSo2Known.reduce((sum, wine) => sum + wine.so2, 0) / avgSo2Known.length).toFixed(1) : "N/A";
  const avgPrice = avgPriceKnown.length ? (avgPriceKnown.reduce((sum, wine) => sum + wine.price, 0) / avgPriceKnown.length).toFixed(0) : "N/A";
  const selectedCandidate = analysisResult?.candidates?.find((candidate) => candidate.wine.id === analysisSelectionId) ?? analysisResult?.candidates?.[0] ?? null;
  const labelTargetWine = selectedCandidate?.wine ?? selected;

  function hydrateCatalogDraftFromCandidate(candidate) {
    if (!candidate?.wine) return;

    setCatalogDraft({
      name: candidate.wine.name || "",
      producer: candidate.wine.producer || "",
      country: candidate.wine.country || "FR",
      region: candidate.wine.region || "",
      appellation: candidate.wine.appellation || "",
      color: candidate.wine.color || "white",
      styles: (candidate.wine.styles ?? []).join(", "),
      flavors: (candidate.wine.flavors ?? []).join(", "),
      aliases: (candidate.wine.aliases ?? []).join(", "),
      notes: candidate.wine.notes || "",
    });
  }

  function hydrateLabelDraft(result, candidate) {
    setLabelDraft({
      displayName: candidate?.wine?.name || result?.originalName?.replace(/\.[^.]+$/, "") || "",
      dominantColors: candidate?.wine?.color ? COLOR_MAP[candidate.wine.color]?.label.toLowerCase() ?? "" : "",
      motifs: result?.extractedKeywords?.slice(0, 6).join(", ") ?? "",
      typography: result?.ocr?.text ? (result.ocr.text === result.ocr.text.toUpperCase() ? "all-caps" : "mixed-case") : "",
      badgeText: "",
      notes: result?.ocr?.provider ? `OCR provider: ${result.ocr.provider}` : "",
    });
  }

  async function handleAnalyzeUpload() {
    if (!analysisFile) return;

    setStatusMessage("Analyzing uploaded label…");
    setAppError("");

    try {
      const result = await uploadImage("/api/analyze/upload", analysisFile);
      setAnalysisResult(result);
      setAnalysisSelectionId(result.candidates?.[0]?.wine?.id ?? "");
      hydrateLabelDraft(result, result.candidates?.[0] ?? null);
      if (result.candidates?.[0]?.wine) {
        hydrateCatalogDraftFromCandidate(result.candidates[0]);
        setSelected(result.candidates[0].wine);
      } else {
        setCatalogDraft((current) => ({
          ...current,
          aliases: result.extractedKeywords?.join(", ") ?? current.aliases,
          notes: result.ocr?.text?.slice(0, 240) ?? current.notes,
        }));
      }
      setStatusMessage(`OCR complete via ${result.ocr.provider}${result.fallbackUsed ? " (fallback)" : ""}.`);
    } catch (error) {
      setAppError(error.message);
      setStatusMessage("");
    }
  }

  async function handleSaveLabelData() {
    if (!analysisResult || !labelTargetWine?.id) return;

    try {
      await postJson("/api/labels", {
        catalogWineId: labelTargetWine.id,
        imagePath: analysisResult.imagePath,
        originalName: analysisResult.originalName,
        displayName: labelDraft.displayName,
        ocrText: analysisResult.ocr.text,
        extractedKeywords: analysisResult.extractedKeywords,
        dominantColors: splitCsv(labelDraft.dominantColors),
        motifs: splitCsv(labelDraft.motifs),
        typography: labelDraft.typography,
        badgeText: labelDraft.badgeText,
        notes: labelDraft.notes,
      });
      await refreshData();
      setStatusMessage("Label data saved and linked to the catalog wine.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleRegisterInventory() {
    if (!analysisResult) return;

    try {
      const payload = {
        catalogWineId: selectedCandidate?.wine?.id ?? null,
        customLabel: selectedCandidate?.wine?.name ?? catalogDraft.name,
        quantity: inventoryForm.quantity,
        location: inventoryForm.location,
        notes: inventoryForm.notes,
        imagePath: analysisResult.imagePath,
        ocrText: analysisResult.ocr.text,
        confidence: selectedCandidate?.confidence ?? "unmatched",
      };

      const created = await postJson("/api/inventory", payload);
      await refreshData();
      if (created.wine) setSelected(created.wine);
      setStatusMessage("Inventory item saved.");
      setInventoryForm(INITIAL_INVENTORY_FORM);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleRegisterCatalog() {
    try {
      const payload = {
        ...catalogDraft,
        styles: splitCsv(catalogDraft.styles),
        flavors: splitCsv(catalogDraft.flavors),
        aliases: splitCsv(catalogDraft.aliases),
        labelText: analysisResult?.extractedKeywords ?? [],
        notes: [
          catalogDraft.notes,
          analysisResult?.ocr?.text ? `OCR: ${analysisResult.ocr.text.slice(0, 280)}` : "",
        ].filter(Boolean).join("\n"),
      };

      const created = await postJson("/api/catalog", payload);
      await refreshData();
      setSelected(created);
      setAnalysisSelectionId(created.id);
      setStatusMessage("Catalog record added to unified database.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleManualRecommendations() {
    try {
      const payload = {
        ...manualForm,
        countries: splitCsv(manualForm.countries),
        styles: splitCsv(manualForm.styles),
        flavors: splitCsv(manualForm.flavors),
      };
      const result = await postJson("/api/recommend/manual", payload);
      setManualRecommendations(result);
      setStatusMessage("Manual recommendation run complete.");
      const topWine = result.inventory?.[0]?.wine ?? result.catalog?.[0]?.wine;
      if (topWine) setSelected(topWine);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleContextRecommendations() {
    try {
      const payload = {
        ...contextForm,
        colors: contextForm.colors,
        styles: splitCsv(contextForm.styles),
        flavors: splitCsv(contextForm.flavors),
      };
      const result = await postJson("/api/recommend/context", payload);
      setContextRecommendations(result);
      setStatusMessage("Context-based recommendation run complete.");
      const topWine = result.inventory?.[0]?.wine ?? result.catalog?.[0]?.wine;
      if (topWine) setSelected(topWine);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleRunSource(sourceId) {
    if (!sourceId) return;

    setSourceRunning((current) => ({ ...current, [sourceId]: true }));
    try {
      const result = await postJson(`/api/sources/${sourceId}/run`, {});
      await refreshData();
      setStatusMessage(`Collection complete for ${result.sourceLabel || sourceId}: ${result.imported || 0} imported, ${result.skipped || 0} skipped`);
    } catch (error) {
      setAppError(error.message);
    } finally {
      setSourceRunning((current) => ({ ...current, [sourceId]: false }));
    }
  }

  async function handleRunAllSources() {
    const sources = stats.sourceWatchlist ?? [];
    const runningMap = {};
    for (const source of sources) {
      if (source.enabled !== false) {
        runningMap[source.id] = true;
      }
    }

    setSourceRunning(runningMap);
    setStatusMessage("Running all enabled sources...");

    try {
      const result = await postJson("/api/sources/run", {});
      await refreshData();
      const totalImported = result.reduce((acc, item) => acc + (item.imported || 0), 0);
      const totalSkipped = result.reduce((acc, item) => acc + (item.skipped || 0), 0);
      const errors = result.filter((item) => item.status === "error").length;
      setStatusMessage(`Collection batch complete. Imported ${totalImported}, skipped ${totalSkipped}, errors ${errors}`);
    } catch (error) {
      setAppError(error.message);
    } finally {
      const cleared = {};
      for (const sourceId of Object.keys(runningMap)) {
        cleared[sourceId] = false;
      }
      setSourceRunning(cleared);
    }
  }

  const topInventory = inventory.slice(0, 6);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">NATURAL WINE RESEARCH — OCR / INVENTORY / RECOMMENDATION</div>
          <h1>VIN NATUREL OS</h1>
          <div className="subhead">UNIFIED CATALOG + STOCK IMAGE RECOGNITION + CONTEXT RECOMMENDER</div>
        </div>
        <div className="stats-grid">
          {[
            ["CATALOG", `${stats.catalogCount}`],
            ["INVENTORY", `${stats.inventoryCount}`],
            ["PLOTTABLE", `${stats.plottable}`],
            ["LABEL READY", `${stats.labelReady}`],
            ["LABEL ASSETS", `${stats.labelAssets}`],
            ["COUNTRIES", `${stats.countries}`],
            ["AVG SO₂", avgSo2 === "N/A" ? "N/A" : `${avgSo2} mg/L`],
            ["AVG PRICE", avgPrice === "N/A" ? "N/A" : `€${avgPrice}`],
          ].map(([label, value]) => (
            <div key={label} className="stat-block">
              <div className="stat-label">{label}</div>
              <div className="stat-value">{value}</div>
            </div>
          ))}
        </div>
      </header>

      {stats.sourceWatchlist?.length ? (
        <section className="watchlist-panel">
          <SourceWatchlist
            sources={stats.sourceWatchlist}
            onRun={handleRunSource}
            onRunAll={handleRunAllSources}
            runningIds={sourceRunning}
          />
        </section>
      ) : null}

      {appError ? <div className="app-banner error-banner">{appError}</div> : null}
      {statusMessage ? <div className="app-banner status-banner">{statusMessage}</div> : null}
      {isPending ? <div className="app-banner pending-banner">Refreshing interface…</div> : null}

      <section className="filter-bar">
        <div className="filter-label">VISUAL FILTER ↓</div>

        <div className="chip-row">
          {Object.entries(COLOR_MAP).map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterColor(filterColor === key ? null : key)}
              className="filter-chip"
              style={{
                background: filterColor === key ? value.bg : "transparent",
                borderColor: filterColor === key ? value.dot : "#0a1018",
                color: filterColor === key ? value.dot : "#1a3040",
              }}
            >
              {value.label}
            </button>
          ))}
        </div>

        <div className="divider" />

        <div className="chip-row">
          {Object.entries(FARMING_MAP).map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterFarming(filterFarming === key ? null : key)}
              className="filter-chip"
              style={{
                background: filterFarming === key ? "rgba(255,255,255,0.03)" : "transparent",
                borderColor: filterFarming === key ? value.color : "#0a1018",
                color: filterFarming === key ? value.color : "#1a3040",
              }}
            >
              {value.label.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="divider" />

        <label className="slider-row">
          <span>MAX SO₂</span>
          <input type="range" min={0} max={45} step={5} value={filterSo2Max} onChange={(event) => setFilterSo2Max(Number(event.target.value))} />
          <strong>{filterSo2Max} mg/L</strong>
        </label>
      </section>

      <section className="workspace-grid">
        <div className="module-panel">
          <div className="panel-head">
            <div className="section-label">1. IMAGE UPLOAD / OCR / INVENTORY REGISTRATION</div>
          </div>
          <div className="two-column">
            <div className="stack-col">
              <label className="upload-zone">
                <span>Upload bottle or label image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;
                    setAnalysisFile(nextFile);
                    setAnalysisResult(null);
                    setAnalysisSelectionId("");
                  }}
                />
              </label>

              {analysisPreview ? (
                <div className="preview-card">
                  <img src={analysisPreview} alt="Upload preview" className="preview-image" />
                </div>
              ) : null}

              <div className="form-grid">
                <label>
                  <span>Storage location</span>
                  <input value={inventoryForm.location} onChange={(event) => setInventoryForm((current) => ({ ...current, location: event.target.value }))} />
                </label>
                <label>
                  <span>Quantity</span>
                  <input type="number" min={1} value={inventoryForm.quantity} onChange={(event) => setInventoryForm((current) => ({ ...current, quantity: Number(event.target.value) || 1 }))} />
                </label>
              </div>

              <label>
                <span>Inventory notes</span>
                <textarea value={inventoryForm.notes} onChange={(event) => setInventoryForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>

              <button type="button" className="action-button" disabled={!analysisFile} onClick={handleAnalyzeUpload}>
                Run OCR + Match Catalog
              </button>
            </div>

            <div className="stack-col">
              <div className="result-panel">
                <div className="section-label">OCR RESULT</div>
                {analysisResult ? (
                  <>
                    <div className="meta-line">
                      Provider: {analysisResult.ocr.provider}
                      {analysisResult.fallbackUsed ? " / fallback used" : ""}
                    </div>
                    <div className="ocr-text">{analysisResult.ocr.text || "No readable text returned."}</div>
                    <div className="tag-row">
                      {analysisResult.extractedKeywords?.map((keyword) => (
                        <span key={keyword} className="tag-chip">{keyword}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty-card">Upload a bottle image and run OCR to inspect label text and candidate matches.</div>
                )}
              </div>

              <div className="result-panel">
                <div className="section-label">MATCH CANDIDATES</div>
                <div className="match-grid">
                  {analysisResult?.candidates?.length ? analysisResult.candidates.map((candidate) => (
                    <button
                      key={candidate.wine.id}
                      type="button"
                      className={`match-card ${analysisSelectionId === candidate.wine.id ? "match-card-active" : ""}`}
                      onClick={() => {
                        setAnalysisSelectionId(candidate.wine.id);
                        setSelected(candidate.wine);
                        hydrateCatalogDraftFromCandidate(candidate);
                        hydrateLabelDraft(analysisResult, candidate);
                      }}
                    >
                      <div className="match-topline">
                        <span className={`match-confidence confidence-${candidate.confidence}`}>{candidate.confidence}</span>
                        <span className="match-score">{Math.round(candidate.coverage * 100)}%</span>
                      </div>
                      <div className="match-title">{candidate.wine.name}</div>
                      <div className="match-subtitle">{candidate.wine.producer}</div>
                      <div className="match-terms">{candidate.matchedTerms.join(" · ")}</div>
                    </button>
                  )) : (
                    <div className="empty-card">No catalog match yet. Use the draft form below to register a new unified catalog record.</div>
                  )}
                </div>

                <div className="inline-actions">
                  <button type="button" className="secondary-button" disabled={!analysisResult} onClick={handleRegisterInventory}>
                    Save To Inventory
                  </button>
                  <span className="micro-copy">
                    Selected match: {selectedCandidate?.wine?.name ?? "none"}
                  </span>
                </div>
              </div>

              <div className="result-panel">
                <div className="section-label">CATALOG CANDIDATE DRAFT</div>
                <div className="form-grid triple-grid">
                  <label>
                    <span>Name</span>
                    <input value={catalogDraft.name} onChange={(event) => setCatalogDraft((current) => ({ ...current, name: event.target.value }))} />
                  </label>
                  <label>
                    <span>Producer</span>
                    <input value={catalogDraft.producer} onChange={(event) => setCatalogDraft((current) => ({ ...current, producer: event.target.value }))} />
                  </label>
                  <label>
                    <span>Country</span>
                    <input value={catalogDraft.country} onChange={(event) => setCatalogDraft((current) => ({ ...current, country: event.target.value.toUpperCase() }))} />
                  </label>
                  <label>
                    <span>Region</span>
                    <input value={catalogDraft.region} onChange={(event) => setCatalogDraft((current) => ({ ...current, region: event.target.value }))} />
                  </label>
                  <label>
                    <span>Appellation</span>
                    <input value={catalogDraft.appellation} onChange={(event) => setCatalogDraft((current) => ({ ...current, appellation: event.target.value }))} />
                  </label>
                  <label>
                    <span>Color</span>
                    <select value={catalogDraft.color} onChange={(event) => setCatalogDraft((current) => ({ ...current, color: event.target.value }))}>
                      {Object.keys(COLOR_MAP).map((color) => <option key={color} value={color}>{COLOR_MAP[color].label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    <span>Styles</span>
                    <input value={catalogDraft.styles} onChange={(event) => setCatalogDraft((current) => ({ ...current, styles: event.target.value }))} placeholder="skin-contact, juicy, volcanic" />
                  </label>
                  <label>
                    <span>Flavors</span>
                    <input value={catalogDraft.flavors} onChange={(event) => setCatalogDraft((current) => ({ ...current, flavors: event.target.value }))} placeholder="citrus, saline, walnut" />
                  </label>
                </div>
                <label>
                  <span>Aliases / label hints</span>
                  <input value={catalogDraft.aliases} onChange={(event) => setCatalogDraft((current) => ({ ...current, aliases: event.target.value }))} />
                </label>
                <label>
                  <span>Notes</span>
                  <textarea value={catalogDraft.notes} onChange={(event) => setCatalogDraft((current) => ({ ...current, notes: event.target.value }))} />
                </label>
                <button type="button" className="action-button" onClick={handleRegisterCatalog}>
                  Add To Unified Catalog
                </button>
              </div>

              <div className="result-panel">
                <div className="section-label">LABEL DATA DRAFT</div>
                <div className="micro-copy">
                  Target wine: {labelTargetWine?.name ?? "Select a matched wine or create one first"}
                </div>
                <div className="form-grid">
                  <label>
                    <span>Label display name</span>
                    <input value={labelDraft.displayName} onChange={(event) => setLabelDraft((current) => ({ ...current, displayName: event.target.value }))} />
                  </label>
                  <label>
                    <span>Dominant colors</span>
                    <input value={labelDraft.dominantColors} onChange={(event) => setLabelDraft((current) => ({ ...current, dominantColors: event.target.value }))} placeholder="white, blue, gold" />
                  </label>
                  <label>
                    <span>Motifs</span>
                    <input value={labelDraft.motifs} onChange={(event) => setLabelDraft((current) => ({ ...current, motifs: event.target.value }))} placeholder="figure, cat, badge, minimal icon" />
                  </label>
                  <label>
                    <span>Typography</span>
                    <input value={labelDraft.typography} onChange={(event) => setLabelDraft((current) => ({ ...current, typography: event.target.value }))} placeholder="handwritten, sans, all-caps" />
                  </label>
                  <label className="full-span">
                    <span>Badge / sticker text</span>
                    <input value={labelDraft.badgeText} onChange={(event) => setLabelDraft((current) => ({ ...current, badgeText: event.target.value }))} placeholder="award, importer sticker, vintage seal" />
                  </label>
                </div>
                <label>
                  <span>Label notes</span>
                  <textarea value={labelDraft.notes} onChange={(event) => setLabelDraft((current) => ({ ...current, notes: event.target.value }))} />
                </label>
                <button type="button" className="secondary-button" disabled={!analysisResult || !labelTargetWine?.id} onClick={handleSaveLabelData}>
                  Save Label Data
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="module-panel">
          <div className="panel-head">
            <div className="section-label">2. RECOMMENDATION ENGINES</div>
          </div>
          <div className="two-column">
            <div className="stack-col">
              <div className="result-panel">
                <div className="section-label">MANUAL PREFERENCES</div>
                <div className="form-grid triple-grid">
                  <label>
                    <span>Mood</span>
                    <input value={manualForm.mood} onChange={(event) => setManualForm((current) => ({ ...current, mood: event.target.value }))} placeholder="fresh, comforting, experimental" />
                  </label>
                  <label>
                    <span>Countries</span>
                    <input value={manualForm.countries} onChange={(event) => setManualForm((current) => ({ ...current, countries: event.target.value }))} placeholder="FR, IT, GE" />
                  </label>
                  <label>
                    <span>Styles</span>
                    <input value={manualForm.styles} onChange={(event) => setManualForm((current) => ({ ...current, styles: event.target.value }))} placeholder="mineral, skin-contact, carbonic" />
                  </label>
                  <label>
                    <span>Flavors</span>
                    <input value={manualForm.flavors} onChange={(event) => setManualForm((current) => ({ ...current, flavors: event.target.value }))} placeholder="citrus, funk, walnut" />
                  </label>
                  <label>
                    <span>Max price</span>
                    <input type="number" min={0} value={manualForm.maxPrice} onChange={(event) => setManualForm((current) => ({ ...current, maxPrice: Number(event.target.value) || 0 }))} />
                  </label>
                  <label>
                    <span>Min naturalness</span>
                    <input type="number" min={0} max={10} step={0.5} value={manualForm.minNaturalness} onChange={(event) => setManualForm((current) => ({ ...current, minNaturalness: Number(event.target.value) || 0 }))} />
                  </label>
                </div>
                <div className="chip-row">
                  {Object.entries(COLOR_MAP).map(([color, value]) => (
                    <button
                      key={color}
                      type="button"
                      className={`filter-chip ${manualForm.colors.includes(color) ? "chip-active" : ""}`}
                      onClick={() => setManualForm((current) => ({
                        ...current,
                        colors: current.colors.includes(color)
                          ? current.colors.filter((item) => item !== color)
                          : [...current.colors, color],
                      }))}
                    >
                      {value.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="action-button" onClick={handleManualRecommendations}>
                  Run Manual Recommendations
                </button>
              </div>

              <RecommendationColumn
                title="CATALOG PICKS"
                items={manualRecommendations?.catalog}
                onSelect={setSelected}
                emptyLabel="Set your taste filters to score the unified catalog."
              />
              <RecommendationColumn
                title="INVENTORY PICKS"
                items={manualRecommendations?.inventory}
                onSelect={setSelected}
                emptyLabel="Inventory-linked wines will appear here after OCR registration."
              />
            </div>

            <div className="stack-col">
              <div className="result-panel">
                <div className="section-label">AUTO CONTEXT</div>
                <div className="form-grid triple-grid">
                  <label>
                    <span>City</span>
                    <input value={contextForm.city} onChange={(event) => setContextForm((current) => ({ ...current, city: event.target.value }))} />
                  </label>
                  <label>
                    <span>Headline topic</span>
                    <input value={contextForm.headlineTopic} onChange={(event) => setContextForm((current) => ({ ...current, headlineTopic: event.target.value }))} />
                  </label>
                  <label>
                    <span>Max price</span>
                    <input type="number" min={0} value={contextForm.maxPrice} onChange={(event) => setContextForm((current) => ({ ...current, maxPrice: Number(event.target.value) || 0 }))} />
                  </label>
                  <label className="full-span">
                    <span>DJ / set notes</span>
                    <textarea value={contextForm.djNotes} onChange={(event) => setContextForm((current) => ({ ...current, djNotes: event.target.value }))} placeholder="ambient sunrise, dub techno, high energy disco…" />
                  </label>
                  <label>
                    <span>Styles bias</span>
                    <input value={contextForm.styles} onChange={(event) => setContextForm((current) => ({ ...current, styles: event.target.value }))} />
                  </label>
                  <label>
                    <span>Flavor bias</span>
                    <input value={contextForm.flavors} onChange={(event) => setContextForm((current) => ({ ...current, flavors: event.target.value }))} />
                  </label>
                </div>
                <div className="chip-row">
                  {Object.entries(COLOR_MAP).map(([color, value]) => (
                    <button
                      key={color}
                      type="button"
                      className={`filter-chip ${contextForm.colors.includes(color) ? "chip-active" : ""}`}
                      onClick={() => setContextForm((current) => ({
                        ...current,
                        colors: current.colors.includes(color)
                          ? current.colors.filter((item) => item !== color)
                          : [...current.colors, color],
                      }))}
                    >
                      {value.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="action-button" onClick={handleContextRecommendations}>
                  Fetch Weather / Headlines + Recommend
                </button>
              </div>

              {contextRecommendations?.snapshot ? (
                <div className="result-panel">
                  <div className="section-label">CONTEXT SNAPSHOT</div>
                  <div className="snapshot-block">
                    <div className="snapshot-row">
                      <strong>Weather</strong>
                      <span>
                        {contextRecommendations.snapshot.weather.location} · {contextRecommendations.snapshot.weather.summary} · {contextRecommendations.snapshot.weather.temperature}°C
                      </span>
                    </div>
                    <div className="tag-row">
                      {contextRecommendations.snapshot.tags.map((tag) => (
                        <span key={tag} className="tag-chip">{tag}</span>
                      ))}
                    </div>
                    <div className="snapshot-row">
                      <strong>Headlines</strong>
                    </div>
                    <div className="headline-list">
                      {contextRecommendations.snapshot.news.items.map((item) => (
                        <a key={item.link} href={item.link} target="_blank" rel="noreferrer">{item.title}</a>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <RecommendationColumn
                title="AUTO CATALOG PICKS"
                items={contextRecommendations?.catalog}
                onSelect={setSelected}
                emptyLabel="Weather, headlines, and DJ cues will score the unified catalog here."
              />
              <RecommendationColumn
                title="AUTO INVENTORY PICKS"
                items={contextRecommendations?.inventory}
                onSelect={setSelected}
                emptyLabel="Inventory stock will be prioritized here when linked wines exist."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="inventory-panel">
        <div className="panel-head">
          <div className="section-label">3. INVENTORY SNAPSHOT</div>
          <div className="micro-copy">{stats.inventoryLinked}/{stats.inventoryCount} linked to catalog</div>
        </div>
        <div className="inventory-grid">
          {topInventory.length ? topInventory.map((item) => (
            <button key={item.id} type="button" className="inventory-card" onClick={() => item.wine && setSelected(item.wine)}>
              {item.imagePath ? <img src={item.imagePath} alt={item.customLabel || item.wine?.name || "Inventory bottle"} className="inventory-image" /> : null}
              <div className="inventory-body">
                <div className="inventory-title">{item.wine?.name || item.customLabel || "Unmatched bottle"}</div>
                <div className="inventory-subtitle">{item.wine?.producer || "Needs catalog match"}</div>
                <div className="inventory-meta">
                  {item.location || "Unknown location"} · qty {item.quantity}
                </div>
              </div>
            </button>
          )) : (
            <div className="empty-card">No inventory items yet. Upload a bottle photo above and save the OCR result.</div>
          )}
        </div>
      </section>

      <main className="content-grid">
        <section className="main-panel">
          <div className="panel-head">
            <div className="section-label">4. VISUALIZATION: SO₂ × INTERVENTION</div>
            <div className="legend">
              <span>● SIZE = PRICE</span>
              {Object.entries(COLOR_MAP).map(([key, value]) => (
                <span key={key}><span style={{ color: value.dot }}>●</span> {value.label}</span>
              ))}
            </div>
          </div>

          <div className="chart-wrap">
            <ScatterPlot wines={plottable} selected={selected} onSelect={setSelected} />
          </div>

          <div className="region-panel">
            <div className="section-label">DISTRIBUTION BY REGION</div>
            <BarChart wines={filtered} />
          </div>
        </section>

        <aside className="detail-panel">
          <div className="section-label">WINE DETAIL</div>
          <WineDetail wine={selected} />
        </aside>
      </main>

      <section className="table-panel">
        <div className="table-head">
          <span>CATALOG TABLE — {filtered.length} RECORDS</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {["PRODUCER", "WINE", "COUNTRY", "REGION", "COLOR", "GRAPE", "VINTAGE", "SO₂", "FARMING", "SKIN", "PRICE"].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((wine) => {
                const col = COLOR_MAP[wine.color]?.dot ?? "#aaa";
                const isSelected = selected?.id === wine.id;

                return (
                  <tr key={wine.id} onClick={() => setSelected(isSelected ? null : wine)} className={isSelected ? "selected-row" : ""}>
                    <td>{wine.producer}</td>
                    <td style={{ color: col }}>{wine.name}</td>
                    <td>{FLAG_MAP[wine.country] ?? wine.country}</td>
                    <td>{wine.region}</td>
                    <td style={{ color: col }}>{COLOR_MAP[wine.color]?.label}</td>
                    <td>{wine.grapes.join(", ")}</td>
                    <td>{wine.vintage ?? "NV"}</td>
                    <td style={{ color: wine.so2 === 0 ? "#7eb8b0" : "#2a4050" }}>{wine.so2 === 0 ? "ZERO" : Number.isFinite(wine.so2) ? wine.so2 : "—"}</td>
                    <td style={{ color: FARMING_MAP[wine.farming]?.color ?? "#6a8a9a" }}>{wine.farming.replace("_", " ").toUpperCase()}</td>
                    <td>{Number.isFinite(wine.skinDays) ? `${wine.skinDays}d` : "—"}</td>
                    <td>{Number.isFinite(wine.price) ? `€${wine.price}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
