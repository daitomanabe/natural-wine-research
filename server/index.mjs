import express from "express";
import multer from "multer";
import path from "node:path";
import { addCatalogRecord, buildCatalogStats, listCatalog, mapCatalogById } from "./lib/catalog.mjs";
import {
  buildContextSnapshot,
  buildLiveDjNotes,
  getLiveContext,
  setLiveContext,
} from "./lib/context.mjs";
import {
  addInventoryItem,
  addInventoryItems,
  listInventory,
  materializeInventory,
  summarizeInventory,
} from "./lib/inventory.mjs";
import { addLabelRecord, listLabels } from "./lib/labels.mjs";
import { analyzeUploadedImage } from "./lib/ocr.mjs";
import { ROOT_DIR, UPLOADS_DIR } from "./lib/paths.mjs";
import { buildContextRecommendations, buildManualRecommendations } from "./lib/recommendations.mjs";
import { ensureStorage, slugify, splitCsv } from "./lib/storage.mjs";
import { listSources, runAllSources, runSourceCollection } from "./lib/sources.mjs";

const app = express();
const PORT = Number(process.env.API_PORT || 8787);

await ensureStorage();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const base = slugify(path.basename(file.originalname, ext));
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

app.use(express.json({ limit: "4mb" }));
app.use("/uploads", express.static(UPLOADS_DIR));

async function getState() {
  const catalog = await listCatalog();
  const inventory = await listInventory();
  const labels = await listLabels();
  const catalogMap = mapCatalogById(catalog);
  const materializedInventory = materializeInventory(inventory, catalogMap);

  return {
    catalog,
    inventory,
    labels,
    catalogMap,
    materializedInventory,
  };
}

app.get("/api/health", async (_req, res) => {
  const watchlist = await listSources();
  res.json({
    ok: true,
    apiPort: PORT,
    watchlistCount: watchlist.length,
    azureConfigured: Boolean(
      (process.env.AZURE_DOC_INTEL_ENDPOINT || process.env.AZURE_ENDPOINT) &&
      (process.env.AZURE_DOC_INTEL_KEY || process.env.AZURE_KEY),
    ),
  });
});

app.get("/api/catalog", async (_req, res) => {
  const { catalog } = await getState();
  res.json(catalog);
});

app.get("/api/inventory", async (_req, res) => {
  const { materializedInventory } = await getState();
  res.json(materializedInventory);
});

app.get("/api/inventory/summary", async (_req, res) => {
  const inventory = await listInventory();
  res.json(summarizeInventory(inventory));
});

app.get("/api/labels", async (_req, res) => {
  const labels = await listLabels();
  res.json(labels);
});

app.get("/api/context/live", async (_req, res) => {
  const context = await getLiveContext();
  res.json(context);
});

app.get("/api/stats", async (_req, res) => {
  const { catalog, inventory, labels } = await getState();
  const watchlist = await listSources();
  res.json({
    ...buildCatalogStats(catalog, inventory, labels),
    sourceWatchlist: watchlist,
  });
});

app.get("/api/sources", async (_req, res) => {
  const sources = await listSources();
  res.json(sources);
});

app.post("/api/sources/:id/run", async (req, res) => {
  try {
    const sourceId = req.params.id;
    const sourceBody = req.body ?? {};
    const result = await runSourceCollection(sourceId, {
      endpoint: sourceBody.endpoint,
      limit: sourceBody.limit,
      force: sourceBody.force,
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "source collection failed";
    res.status(400).json({ error: message });
  }
});

app.post("/api/sources/run", async (req, res) => {
  try {
    const sourceBody = req.body ?? {};
    const result = await runAllSources({
      sourceIds: sourceBody.sourceIds,
      limit: sourceBody.limit,
      force: sourceBody.force,
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "source collection failed";
    res.status(500).json({ error: message });
  }
});

app.post("/api/analyze/upload", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "image is required" });
    return;
  }

  const { catalog } = await getState();
  const analysis = await analyzeUploadedImage(req.file.path, catalog);

  res.json({
    imagePath: `/uploads/${req.file.filename}`,
    originalName: req.file.originalname,
    ...analysis,
  });
});

app.post("/api/inventory", async (req, res) => {
  const item = await addInventoryItem(req.body);
  const { materializedInventory } = await getState();
  const created = materializedInventory.find((entry) => entry.id === item.id) ?? item;
  res.status(201).json(created);
});

app.post("/api/inventory/import", async (req, res) => {
  const items = Array.isArray(req.body?.items)
    ? req.body.items
    : Array.isArray(req.body)
      ? req.body
      : [];

  const created = await addInventoryItems(items);
  const { materializedInventory } = await getState();

  res.status(201).json({
    created,
    createdCount: created.length,
    catalogInventoryCount: materializedInventory.length,
  });
});

app.post("/api/catalog", async (req, res) => {
  if (!req.body?.name || !req.body?.producer) {
    res.status(400).json({ error: "name and producer are required" });
    return;
  }

  const record = await addCatalogRecord(req.body);
  res.status(201).json(record);
});

app.post("/api/labels", async (req, res) => {
  if (!req.body?.catalogWineId) {
    res.status(400).json({ error: "catalogWineId is required" });
    return;
  }

  const { catalogMap } = await getState();
  if (!catalogMap.has(req.body.catalogWineId)) {
    res.status(404).json({ error: "catalog wine not found" });
    return;
  }

  const record = await addLabelRecord(req.body);
  res.status(201).json(record);
});

app.post("/api/recommend/manual", async (req, res) => {
  const { catalog, materializedInventory } = await getState();
  const profile = {
    mood: req.body.mood || "",
    colors: req.body.colors ?? [],
    countries: req.body.countries ?? [],
    styles: Array.isArray(req.body.styles) ? req.body.styles : splitCsv(req.body.styles),
    flavors: Array.isArray(req.body.flavors) ? req.body.flavors : splitCsv(req.body.flavors),
    maxPrice: req.body.maxPrice || null,
    minNaturalness: req.body.minNaturalness || null,
  };

  res.json(buildManualRecommendations({
    catalog,
    inventory: materializedInventory,
    profile,
  }));
});

app.post("/api/recommend/context", async (req, res) => {
  const { catalog, materializedInventory } = await getState();
  const snapshot = await buildContextSnapshot(req.body ?? {});
  const profile = {
    colors: req.body.colors ?? [],
    countries: req.body.countries ?? [],
    styles: Array.isArray(req.body.styles) ? req.body.styles : splitCsv(req.body.styles),
    flavors: Array.isArray(req.body.flavors) ? req.body.flavors : splitCsv(req.body.flavors),
    maxPrice: req.body.maxPrice || null,
  };

  res.json(buildContextRecommendations({
    catalog,
    inventory: materializedInventory,
    snapshot,
    profile,
  }));
});

app.post("/api/context/live", async (req, res) => {
  try {
    const context = await setLiveContext(req.body ?? {});
    res.json(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to save live context";
    res.status(400).json({ error: message });
  }
});

app.post("/api/recommend/live", async (req, res) => {
  try {
    const { catalog, materializedInventory } = await getState();
    const persistedContext = await getLiveContext();
    const body = req.body ?? {};
    const merged = {
      city: body.city || persistedContext.city || "Tokyo",
      headlineTopic: body.headlineTopic || persistedContext.headlineTopic || "natural wine",
      djNotes: [persistedContext.djNotes, body.djNotes]
        .filter(Boolean)
        .join(" · "),
      colors: body.colors ?? persistedContext.colors ?? [],
      track: {
        ...persistedContext.track,
        ...(body.track ?? {}),
      },
    };
    const profile = {
      colors: Array.isArray(merged.colors) ? merged.colors : splitCsv(merged.colors),
      countries: Array.isArray(body.countries) ? body.countries : splitCsv(body.countries),
      styles: Array.isArray(body.styles) ? body.styles : splitCsv(body.styles),
      flavors: Array.isArray(body.flavors) ? body.flavors : splitCsv(body.flavors),
      maxPrice: body.maxPrice ?? persistedContext.maxPrice,
      minNaturalness: body.minNaturalness ?? null,
      mood: body.mood || "",
    };
    const snapshot = await buildContextSnapshot({
      city: merged.city,
      headlineTopic: merged.headlineTopic,
      djNotes: buildLiveDjNotes({ ...merged, track: merged.track }),
    });

    res.json({
      ...buildContextRecommendations({
        catalog,
        inventory: materializedInventory,
        snapshot,
        profile,
      }),
      liveContext: merged,
      source: "live-track",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "live recommendation failed";
    res.status(500).json({ error: message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`API server running at http://127.0.0.1:${PORT}`);
  console.log(`Workspace root: ${ROOT_DIR}`);
});
