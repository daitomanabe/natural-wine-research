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

const KIOSK_REFRESH_OPTIONS = [20, 30, 45, 60];

const INITIAL_LIVE_FORM = {
  city: "Tokyo",
  headlineTopic: "natural wine",
  djNotes: "",
  artist: "",
  songTitle: "",
  bpm: "",
  energy: "",
  trackGenres: "",
  maxPrice: 45,
};

const APP_VIEWS = [
  { id: "operations", label: "Cellar Operations" },
  { id: "insights", label: "Catalog Insights" },
  { id: "kiosk", label: "iPad Kiosk Recommendations" },
];

function textIncludes(haystack, query) {
  return String(haystack ?? "").toLowerCase().includes(query);
}

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseInventoryCsvRows(text) {
  const rows = [];
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return rows;

  const header = lines[0].split(",").map((cell) => cell.trim());
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);

    const item = {};
    for (let v = 0; v < header.length; v++) {
      const key = header[v];
      const value = values[v] ?? "";
      item[key] = value.replace(/^"|"$/g, "").trim();
    }
    rows.push(item);
  }
  return rows;
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
  const [viewMode, setViewMode] = useState("operations");
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [sourceScope, setSourceScope] = useState("all");
  const [genreFilter, setGenreFilter] = useState([]);
  const [regionFilter, setRegionFilter] = useState([]);
  const [filterColor, setFilterColor] = useState(null);
  const [filterFarming, setFilterFarming] = useState(null);
  const [filterSo2Max, setFilterSo2Max] = useState(45);
  const [appError, setAppError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [sourceRunning, setSourceRunning] = useState({});
  const [liveContext, setLiveContext] = useState(null);
  const [liveForm, setLiveForm] = useState(INITIAL_LIVE_FORM);
  const [kioskAuto, setKioskAuto] = useState(true);
  const [kioskInterval, setKioskInterval] = useState(30);
  const [isPending, startTransition] = useTransition();

  const [analysisFile, setAnalysisFile] = useState(null);
  const [analysisPreview, setAnalysisPreview] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisSelectionId, setAnalysisSelectionId] = useState("");
  const [inventoryImportText, setInventoryImportText] = useState("");
  const [importFormat, setImportFormat] = useState("csv");
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
      const liveData = await getJson("/api/context/live");

      startTransition(() => {
        setCatalog(catalogData);
        setInventory(inventoryData);
        setStats(statsData);
        setLiveContext(liveData);
        setLiveForm((current) => ({
          ...current,
          city: liveData.city || current.city,
          headlineTopic: liveData.headlineTopic || current.headlineTopic,
          djNotes: liveData.djNotes || current.djNotes,
          maxPrice: Number.isFinite(Number(liveData.maxPrice)) ? Number(liveData.maxPrice) : current.maxPrice,
          artist: liveData.track?.artist || current.artist,
          songTitle: liveData.track?.title || current.songTitle,
          bpm: liveData.track?.bpm ? String(liveData.track.bpm) : current.bpm,
          energy: liveData.track?.energy ? String(liveData.track?.energy) : current.energy,
          trackGenres: Array.isArray(liveData.track?.genres) ? liveData.track.genres.join(", ") : (current.trackGenres || ""),
        }));
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

  const catalogSourceCounts = useMemo(() => {
    const counts = {
      all: catalog.length,
      seed: 0,
      custom: 0,
      unknown: 0,
    };

    for (const wine of catalog) {
      if (wine.source === "seed") counts.seed += 1;
      else if (wine.source) counts.custom += 1;
      else counts.unknown += 1;
    }

    return counts;
  }, [catalog]);

  const genreIndex = useMemo(() => {
    const map = new Map();
    catalog.forEach((wine) => {
      const tags = [...(wine.styles ?? []), ...(wine.flavors ?? [])];
      tags.forEach((tag) => {
        const key = String(tag).toLowerCase();
        if (!key) return;
        map.set(key, (map.get(key) ?? 0) + 1);
      });
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [catalog]);

  const availableRegions = useMemo(() => [...new Set(catalog.map((wine) => wine.region).filter(Boolean))].sort(), [catalog]);

  const filtered = useMemo(() => catalog.filter((wine) => {
    const query = search.trim().toLowerCase();
    const source = wine.source || "seed";

    if (sourceScope !== "all") {
      if (sourceScope === "seed" && source !== "seed") return false;
      if (sourceScope === "custom" && source === "seed") return false;
    }
    if (filterColor && wine.color !== filterColor) return false;
    if (filterFarming && wine.farming !== filterFarming) return false;
    if (filterSo2Max < 45 && !Number.isFinite(wine.so2)) return false;
    if (Number.isFinite(wine.so2) && wine.so2 > filterSo2Max) return false;
    if (genreFilter.length > 0) {
      const haystack = [...(wine.styles ?? []), ...(wine.flavors ?? [])].map((value) => String(value).toLowerCase());
      if (!genreFilter.some((genre) => haystack.includes(genre))) return false;
    }
    if (regionFilter.length > 0 && !regionFilter.includes(wine.region)) return false;
    if (query) {
      const searchable = [
        wine.name,
        wine.producer,
        wine.region,
        wine.appellation,
        wine.country,
        ...(wine.grapes ?? []),
        ...(wine.styles ?? []),
        ...(wine.flavors ?? []),
        ...(wine.aliases ?? []),
      ].join(" ").toLowerCase();

      if (!textIncludes(searchable, query)) return false;
    }
    return true;
  }), [catalog, filterColor, filterFarming, filterSo2Max, genreFilter, regionFilter, search, sourceScope]);

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

  async function handleBulkInventoryImport() {
    if (!inventoryImportText.trim()) {
      setAppError("No import payload provided.");
      return;
    }

    try {
      setAppError("");
      setStatusMessage("Importing cellar inventory...");

      const payload = importFormat === "json"
        ? JSON.parse(inventoryImportText)
        : parseInventoryCsvRows(inventoryImportText);

      const items = Array.isArray(payload)
        ? payload
        : [];

      if (!items.length) {
        throw new Error("No valid items found. Paste CSV/JSON with one row per bottle.");
      }

      const normalized = items.map((entry) => ({
        catalogWineId: entry.catalogWineId || entry.catalogId || "",
        customLabel: entry.customLabel || entry.label || entry.name || "",
        quantity: Number(entry.quantity ?? 1) || 1,
        location: entry.location || "Cellar",
        notes: entry.notes || "",
        confidence: entry.confidence || "manual-import",
      }));

      const result = await postJson("/api/inventory/import", { items: normalized });
      await refreshData();
      setStatusMessage(`Inventory import complete. added ${result.createdCount || items.length} items.`);
      setInventoryImportText("");
    } catch (error) {
      setAppError(error.message);
      setStatusMessage("");
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

  async function handleSaveLiveContext() {
    setAppError("");
    const payload = {
      city: liveForm.city,
      headlineTopic: liveForm.headlineTopic,
      djNotes: liveForm.djNotes,
      maxPrice: liveForm.maxPrice,
      track: {
        artist: liveForm.artist,
        title: liveForm.songTitle,
        bpm: liveForm.bpm ? Number(liveForm.bpm) : null,
        energy: liveForm.energy ? Number(liveForm.energy) : null,
        genres: splitCsv(liveForm.trackGenres),
        mood: liveForm.djNotes,
      },
    };

    const context = await postJson("/api/context/live", payload);
    setLiveContext(context);
    setStatusMessage("Live context saved for iPad kiosk recommendations.");
  }

  async function handleRunLiveRecommendations() {
    setAppError("");
    try {
      const result = await postJson("/api/recommend/live", {
        city: liveForm.city,
        headlineTopic: liveForm.headlineTopic,
        maxPrice: Number.isFinite(Number(liveForm.maxPrice)) ? Number(liveForm.maxPrice) : 45,
        styles: [],
        flavors: [],
        colors: [],
        djNotes: liveForm.djNotes,
        track: {
          artist: liveForm.artist,
          title: liveForm.songTitle,
          bpm: liveForm.bpm ? Number(liveForm.bpm) : null,
          energy: liveForm.energy ? Number(liveForm.energy) : null,
          genres: splitCsv(liveForm.trackGenres),
        },
      });

      setContextRecommendations(result);
      setStatusMessage("Live recommendation refreshed.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  useEffect(() => {
    if (viewMode !== "kiosk") return;
    if (!kioskAuto) return;

    const timer = setInterval(() => {
      void handleRunLiveRecommendations();
    }, kioskInterval * 1000);

    return () => clearInterval(timer);
  }, [
    kioskInterval,
    kioskAuto,
    viewMode,
    liveForm.artist,
    liveForm.songTitle,
    liveForm.city,
    liveForm.headlineTopic,
    liveForm.djNotes,
    liveForm.trackGenres,
    liveForm.bpm,
    liveForm.energy,
    liveForm.maxPrice,
  ]);

  useEffect(() => {
    if (viewMode === "kiosk") {
      void handleRunLiveRecommendations();
    }
  }, [viewMode]);

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
  const isKiosk = viewMode === "kiosk";
  const liveUpdatedAt = liveContext?.updatedAt
    ? new Date(liveContext.updatedAt).toLocaleString("en-US")
    : "Not saved";
  const liveTrack = liveContext?.track ?? {};
  const liveTrackGenres = Array.isArray(liveTrack.genres) ? liveTrack.genres.join(", ") : "";
  const liveSnapshot = contextRecommendations?.snapshot ?? null;
  const liveWeather = liveSnapshot?.weather ?? null;
  const liveNews = liveSnapshot?.news ?? null;
  const liveTags = liveSnapshot?.tags ?? [];

  if (isKiosk) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div>
            <div className="eyebrow">NATURAL WINE RESEARCH — KIOSK RECOMMENDATION HUB</div>
            <h1>VIN NATUREL OS</h1>
            <div className="subhead">DJ-CONTEXT RECOMMENDATIONS + INVENTORY AWARE DISPLAY</div>
          </div>
          <div className="stats-grid">
          {[
            ["GLOBAL CATALOG", `${stats.catalogCount}`],
            ["CELLAR STOCK", `${stats.inventoryCount}`],
            ["BOTTLES", `${stats.inventoryUnits ?? 0}`],
            ["LABEL READY", `${stats.labelReady}`],
            ["LIVE SOURCE", liveContext?.track?.title || "—"],
          ].map(([label, value]) => (
              <div key={label} className="stat-block">
                <div className="stat-label">{label}</div>
                <div className="stat-value">{value}</div>
              </div>
            ))}
          </div>
        </header>

        <section className="view-mode-bar">
          {APP_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setViewMode(view.id)}
              className={`filter-chip ${viewMode === view.id ? "chip-active" : ""}`}
            >
              {view.label}
            </button>
          ))}
        </section>

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

        <section className="module-panel">
          <div className="panel-head">
            <div className="section-label">LIVE DJ FEED / AUTOMATION ENGINE</div>
            <div className="micro-copy">Saved: {liveUpdatedAt}</div>
          </div>
          <div className="kiosk-grid two-column">
            <div className="result-panel">
              <div className="form-grid triple-grid">
                <label>
                  <span>City</span>
                  <input value={liveForm.city} onChange={(event) => setLiveForm((current) => ({ ...current, city: event.target.value }))} />
                </label>
                <label>
                  <span>Headline topic</span>
                  <input value={liveForm.headlineTopic} onChange={(event) => setLiveForm((current) => ({ ...current, headlineTopic: event.target.value }))} />
                </label>
                <label>
                  <span>Max budget</span>
                  <input
                    type="number"
                    min={0}
                    value={liveForm.maxPrice}
                    onChange={(event) => setLiveForm((current) => ({ ...current, maxPrice: Number(event.target.value) || 45 }))}
                  />
                </label>
                <label>
                  <span>Track artist</span>
                  <input value={liveForm.artist} onChange={(event) => setLiveForm((current) => ({ ...current, artist: event.target.value }))} />
                </label>
                <label>
                  <span>Track title</span>
                  <input value={liveForm.songTitle} onChange={(event) => setLiveForm((current) => ({ ...current, songTitle: event.target.value }))} />
                </label>
                <label>
                  <span>Track genres</span>
                  <input value={liveForm.trackGenres} onChange={(event) => setLiveForm((current) => ({ ...current, trackGenres: event.target.value }))} />
                </label>
                <label>
                  <span>BPM</span>
                  <input type="number" min={0} value={liveForm.bpm} onChange={(event) => setLiveForm((current) => ({ ...current, bpm: event.target.value }))} />
                </label>
                <label>
                  <span>Energy (0-1)</span>
                  <input type="number" min={0} max={1} step={0.05} value={liveForm.energy} onChange={(event) => setLiveForm((current) => ({ ...current, energy: event.target.value }))} />
                </label>
                <label className="full-span">
                  <span>DJ notes</span>
                  <textarea value={liveForm.djNotes} onChange={(event) => setLiveForm((current) => ({ ...current, djNotes: event.target.value }))} />
                </label>
              </div>
              <div className="inline-actions">
                <button type="button" className="action-button" onClick={handleSaveLiveContext}>Save Live Context</button>
                <button type="button" className="secondary-button" onClick={handleRunLiveRecommendations}>Run Live Recommendation</button>
              </div>
              <div className="kiosk-auto-row">
                <label className="inline-toggle">
                  <input type="checkbox" checked={kioskAuto} onChange={(event) => setKioskAuto(event.target.checked)} />
                  <span>AUTO UPDATE</span>
                </label>
                <label>
                  <span>Refresh interval</span>
                  <select value={kioskInterval} onChange={(event) => setKioskInterval(Number(event.target.value))}>
                    {KIOSK_REFRESH_OPTIONS.map((entry) => (
                      <option key={entry} value={entry}>{entry} sec</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="result-panel">
              <div className="section-label">LIVE CONTEXT SNAPSHOT</div>
              {liveSnapshot ? (
                <>
                  <div className="snapshot-row">
                    <strong>Track</strong>
                    <span>{liveContext?.track?.artist || "—"} · {liveContext?.track?.title || "—"}</span>
                  </div>
                  <div className="snapshot-row">
                    <strong>Track metadata</strong>
                    <span>
                      {liveContext?.track?.bpm ? `BPM ${liveContext.track.bpm}` : "BPM N/A"}
                      {" · "}
                      {liveContext?.track?.energy ? `energy ${liveContext.track.energy}` : "energy N/A"}
                      {" · "}
                      {liveTrackGenres || "genres unknown"}
                    </span>
                  </div>
                  {liveWeather ? (
                    <div className="snapshot-row">
                      <strong>WEATHER</strong>
                      <span>{liveWeather.location} · {liveWeather.summary} · {liveWeather.temperature}°C</span>
                    </div>
                  ) : null}
                  <div className="tag-row">
                    {liveTags.map((tag) => (
                      <span key={tag} className="tag-chip">{tag}</span>
                    ))}
                  </div>
                  <div className="headline-list">
                    {liveNews?.items?.slice(0, 4).map((item) => (
                      <a key={item.link} href={item.link} target="_blank" rel="noreferrer">{item.title}</a>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-card">Run live recommendation to produce a snapshot for the iPad kiosk.</div>
              )}
            </div>
          </div>
        </section>

        <section className="workspace-grid">
          <RecommendationColumn
            title="GLOBAL CATALOG PICKS"
            items={contextRecommendations?.catalog}
            onSelect={setSelected}
            emptyLabel="Save live context or press run to generate catalog suggestions."
          />
          <RecommendationColumn
            title="CELLAR INVENTORY PICKS"
            items={contextRecommendations?.inventory}
            onSelect={setSelected}
            emptyLabel="Link inventory items to catalog wines to prioritize cellar stock."
          />
        </section>

        <section className="inventory-panel">
          <div className="panel-head">
            <div className="section-label">CELLAR STOCK SNAPSHOT</div>
            <div className="micro-copy">
              {stats.inventoryUnits || 0} bottles · {stats.inventoryLinked}/{stats.inventoryCount} linked to catalog
            </div>
          </div>
          {stats.inventoryLocationCounts?.length ? (
            <div className="inventory-location-grid">
              {stats.inventoryLocationCounts.slice(0, 8).map(([location, count]) => (
                <div key={location} className="micro-copy">
                  <strong>{location}</strong>: {count} bottles
                </div>
              ))}
            </div>
          ) : null}
          <div className="inventory-grid">
            {topInventory.length ? topInventory.map((item) => (
              <button key={item.id} type="button" className="inventory-card" onClick={() => item.wine && setSelected(item.wine)}>
                {item.imagePath ? <img src={item.imagePath} alt={item.customLabel || item.wine?.name || "Inventory bottle"} className="inventory-image" /> : null}
                <div className="inventory-body">
                  <div className="inventory-title">{item.wine?.name || item.customLabel || "Unmatched bottle"}</div>
                  <div className="inventory-subtitle">{item.wine?.producer || "Needs catalog match"}</div>
                  <div className="inventory-meta">{item.location || "Unknown location"} · qty {item.quantity}</div>
                </div>
              </button>
            )) : (
              <div className="empty-card">No stock captured yet. Upload bottle labels in Operations mode.</div>
            )}
          </div>
        </section>
      </div>
    );
  }

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
            ["GLOBAL CATALOG", `${stats.catalogCount}`],
            ["CELLAR STOCK", `${stats.inventoryCount}`],
            ["BOTTLES", `${stats.inventoryUnits ?? 0}`],
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

      <section className="view-mode-bar">
        {APP_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => setViewMode(view.id)}
            className={`filter-chip ${viewMode === view.id ? "chip-active" : ""}`}
          >
            {view.label}
          </button>
        ))}
      </section>

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
        <label className="search-input-wrap">
          <span>SEARCH (name / producer / grape / region / tags)</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Muscadet, Loirе, orange, minimal..."
          />
        </label>

        <div className="chip-row">
          <button type="button" className={`filter-chip ${sourceScope === "all" ? "chip-active" : ""}`} onClick={() => setSourceScope("all")}>
            All ({catalogSourceCounts.all})
          </button>
          <button type="button" className={`filter-chip ${sourceScope === "seed" ? "chip-active" : ""}`} onClick={() => setSourceScope("seed")}>
            Seed ({catalogSourceCounts.seed})
          </button>
          <button type="button" className={`filter-chip ${sourceScope === "custom" ? "chip-active" : ""}`} onClick={() => setSourceScope("custom")}>
            Custom / Imported ({catalogSourceCounts.custom + catalogSourceCounts.unknown})
          </button>
        </div>

        <div className="chip-row">
          {genreIndex.slice(0, 10).map(([genre]) => (
            <button
              key={genre}
              type="button"
              className={`filter-chip ${genreFilter.includes(genre) ? "chip-active" : ""}`}
              onClick={() => setGenreFilter((current) => (current.includes(genre)
                ? current.filter((entry) => entry !== genre)
                : [...current, genre]))}
            >
              {genre}
            </button>
          ))}
        </div>

        <div className="chip-row">
          {availableRegions.slice(0, 10).map((region) => (
            <button
              key={region}
              type="button"
              className={`filter-chip ${regionFilter.includes(region) ? "chip-active" : ""}`}
              onClick={() => setRegionFilter((current) => (current.includes(region)
                ? current.filter((entry) => entry !== region)
                : [...current, region]))}
            >
              {region}
            </button>
          ))}
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSearch("");
              setGenreFilter([]);
              setRegionFilter([]);
              setFilterColor(null);
              setFilterFarming(null);
              setFilterSo2Max(45);
              setSourceScope("all");
            }}
          >
            RESET FILTERS
          </button>
        </div>

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

                <div className="result-panel">
                  <div className="section-label">BULK INVENTORY IMPORT</div>
                  <div className="chip-row">
                    <button
                      type="button"
                      className={`filter-chip ${importFormat === "csv" ? "chip-active" : ""}`}
                      onClick={() => setImportFormat("csv")}
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${importFormat === "json" ? "chip-active" : ""}`}
                      onClick={() => setImportFormat("json")}
                    >
                      JSON
                    </button>
                  </div>
                  <label className="full-span">
                    <span>
                      {importFormat === "csv"
                        ? "Paste CSV rows (name,customLabel,quantity,location,catalogWineId,notes)"
                        : "Paste JSON array of objects"}
                    </span>
                    <textarea
                      value={inventoryImportText}
                      onChange={(event) => setInventoryImportText(event.target.value)}
                      placeholder={importFormat === "csv"
                        ? "customLabel,quantity,location,catalogWineId,notes\nNatura 42,1,Main Cellar,,unmatched in stock"
                        : '[{"customLabel":"Natura 42","quantity":2,"location":"Main Cellar","catalogWineId":"042","notes":"purchase in May"}]'}
                      style={{ minHeight: 140 }}
                    />
                  </label>
                <div className="inline-actions">
                    <button type="button" className="secondary-button" onClick={handleBulkInventoryImport}>
                      Import Inventory
                    </button>
                  </div>
                </div>

                <button type="button" className="secondary-button" onClick={() => setInventoryImportText("")}>
                  Clear Import Text
                </button>

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
          <div className="micro-copy">
            {stats.inventoryUnits || 0} bottles · {stats.inventoryLinked}/{stats.inventoryCount} linked to catalog
          </div>
        </div>
        {stats.inventoryLocationCounts?.length ? (
          <div className="inventory-location-grid">
            {stats.inventoryLocationCounts.slice(0, 8).map(([location, count]) => (
              <div key={location} className="micro-copy">
                <strong>{location}</strong>: {count} bottles
              </div>
            ))}
          </div>
        ) : null}
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
