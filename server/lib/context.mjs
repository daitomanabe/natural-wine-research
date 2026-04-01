import Parser from "rss-parser";
import path from "node:path";
import { DATA_DIR } from "./paths.mjs";
import { readJson, writeJson } from "./storage.mjs";

const parser = new Parser();
const LIVE_CONTEXT_FILE = path.join(DATA_DIR, "live-context.json");

const DEFAULT_TRACK = {
  title: "",
  artist: "",
  bpm: null,
  energy: null,
  genres: [],
  mood: "",
  source: "dj-studio",
};

const DEFAULT_CONTEXT = {
  city: "Tokyo",
  headlineTopic: "natural wine",
  djNotes: "",
  track: DEFAULT_TRACK,
  maxPrice: 45,
  colors: [],
  moods: [],
  updatedAt: null,
  updatedBy: "system",
};

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeTrack(value) {
  const track = value ?? {};
  const genres = Array.isArray(track.genres) ? track.genres : String(track.genres ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const bpm = Number(track.bpm);
  const energy = Number(track.energy);

  return {
    title: normalizeText(track.title).slice(0, 140),
    artist: normalizeText(track.artist).slice(0, 140),
    bpm: Number.isFinite(bpm) ? bpm : null,
    energy: Number.isFinite(energy) ? energy : null,
    genres: genres.map((entry) => entry.toLowerCase()).filter(Boolean),
    mood: normalizeText(track.mood).slice(0, 120),
    source: normalizeText(track.source || track.platform || "dj-studio").slice(0, 80),
  };
}

function normalizeContextInput(input) {
  const payload = input ?? {};
  const normalized = {
    city: normalizeText(payload.city || payload.location || DEFAULT_CONTEXT.city),
    headlineTopic: normalizeText(payload.headlineTopic || payload.topic || DEFAULT_CONTEXT.headlineTopic),
    djNotes: normalizeText(payload.djNotes || payload.notes || ""),
    maxPrice: Number(payload.maxPrice),
    colors: Array.isArray(payload.colors) ? payload.colors : [],
    moods: Array.isArray(payload.moods) ? payload.moods : [],
    track: normalizeTrack(payload.track || payload),
    updatedAt: new Date().toISOString(),
    updatedBy: normalizeText(payload.updatedBy || "operator") || "operator",
  };

  return {
    ...normalized,
    maxPrice: Number.isFinite(normalized.maxPrice) ? normalized.maxPrice : DEFAULT_CONTEXT.maxPrice,
    colors: normalized.colors.map((item) => normalizeText(item)).filter(Boolean),
    moods: normalized.moods.map((item) => normalizeText(item)).filter(Boolean),
  };
}

function buildTrackNotes(track) {
  const safeTrack = normalizeTrack(track);
  const parts = [];
  if (safeTrack.artist) parts.push(safeTrack.artist);
  if (safeTrack.title) parts.push(safeTrack.title);
  if (safeTrack.mood) parts.push(safeTrack.mood);
  if (safeTrack.genres.length) parts.push(safeTrack.genres.join(", "));
  if (safeTrack.bpm) parts.push(`bpm ${safeTrack.bpm}`);
  if (safeTrack.energy) parts.push(`energy ${safeTrack.energy}`);
  return parts.join(" · ");
}

export async function getLiveContext() {
  return readJson(LIVE_CONTEXT_FILE, { ...DEFAULT_CONTEXT });
}

export async function setLiveContext(payload) {
  const context = normalizeContextInput(payload);
  const existing = await getLiveContext();

  await writeJson(LIVE_CONTEXT_FILE, {
    ...existing,
    ...context,
    track: {
      ...existing.track,
      ...context.track,
    },
    updatedAt: context.updatedAt,
  });

  return getLiveContext();
}

export function buildLiveDjNotes(context) {
  const trackNotes = buildTrackNotes(context?.track);
  const baseNotes = [context?.djNotes, trackNotes, ...((context?.moods ?? []).map((mood) => `mood:${mood}`))].filter(Boolean);
  return [...new Set(baseNotes)].join(" · ");
}

function weatherCodeLabel(code) {
  const map = {
    0: "clear",
    1: "mostly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "fog",
    51: "light drizzle",
    61: "light rain",
    63: "rain",
    65: "heavy rain",
    71: "snow",
    80: "showers",
    95: "thunderstorm",
  };

  return map[code] ?? "mixed";
}

function weatherTags(weather) {
  if (!weather) return [];

  const tags = [];
  if (weather.temperature >= 24) tags.push("fresh", "white", "pétillant");
  if (weather.temperature <= 10) tags.push("structured", "red", "earthy");
  if (weather.precipitation > 0) tags.push("comforting", "textured", "orange");
  if (weather.windSpeed >= 20) tags.push("saline", "mineral");
  if (weather.summary.includes("clear")) tags.push("citrus", "bright");
  if (weather.summary.includes("overcast") || weather.summary.includes("fog")) tags.push("oxidative", "savory");
  return [...new Set(tags)];
}

function djTags(notes) {
  const text = String(notes ?? "").toLowerCase();
  const tags = [];

  if (/(house|disco|boogie|funk)/.test(text)) tags.push("juicy", "pétillant", "casual");
  if (/(ambient|drone|dub|minimal)/.test(text)) tags.push("mineral", "textured", "white");
  if (/(techno|industrial|acid)/.test(text)) tags.push("volcanic", "structured", "orange");
  if (/(jazz|soul|balearic)/.test(text)) tags.push("floral", "elegant", "fresh");

  return [...new Set(tags)];
}

function headlineTags(items) {
  const text = items.map((item) => `${item.title} ${item.contentSnippet ?? ""}`).join(" ").toLowerCase();
  const tags = [];

  if (/(heat|summer|festival|record high|travel)/.test(text)) tags.push("bright", "white", "saline");
  if (/(storm|war|tension|crisis|earthquake)/.test(text)) tags.push("comforting", "structured", "red");
  if (/(innovation|design|culture|art|launch)/.test(text)) tags.push("experimental", "orange", "skin-contact");

  return [...new Set(tags)];
}

async function resolveCoordinates({ city, latitude, longitude }) {
  if (Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
    return {
      latitude: Number(latitude),
      longitude: Number(longitude),
      label: city || "custom location",
    };
  }

  const fallbackCity = city || "Tokyo";
  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeUrl.searchParams.set("name", fallbackCity);
  geocodeUrl.searchParams.set("count", "1");
  geocodeUrl.searchParams.set("language", "en");

  const response = await fetch(geocodeUrl);
  const json = await response.json();
  const result = json.results?.[0];

  if (!result) {
    return {
      latitude: 35.6764,
      longitude: 139.65,
      label: fallbackCity,
    };
  }

  return {
    latitude: result.latitude,
    longitude: result.longitude,
    label: `${result.name}${result.country ? `, ${result.country}` : ""}`,
  };
}

export async function fetchWeatherSnapshot(input) {
  const coords = await resolveCoordinates(input);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(coords.latitude));
  url.searchParams.set("longitude", String(coords.longitude));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m,precipitation");

  const response = await fetch(url);
  const json = await response.json();
  const current = json.current ?? {};

  return {
    location: coords.label,
    temperature: current.temperature_2m ?? null,
    windSpeed: current.wind_speed_10m ?? 0,
    precipitation: current.precipitation ?? 0,
    weatherCode: current.weather_code ?? null,
    summary: weatherCodeLabel(current.weather_code),
    tags: weatherTags({
      temperature: current.temperature_2m ?? null,
      windSpeed: current.wind_speed_10m ?? 0,
      precipitation: current.precipitation ?? 0,
      summary: weatherCodeLabel(current.weather_code),
    }),
  };
}

export async function fetchNewsSnapshot(topic = "natural wine") {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
  const feed = await parser.parseURL(url);
  const items = (feed.items ?? []).slice(0, 5).map((item) => ({
    title: item.title,
    link: item.link,
    contentSnippet: item.contentSnippet ?? "",
    pubDate: item.pubDate ?? null,
  }));

  return {
    topic,
    items,
    tags: headlineTags(items),
  };
}

export async function buildContextSnapshot(input) {
  const context = input ?? {};
  const trackNotes = buildLiveDjNotes(context);

  let weather;
  let news;

  try {
    weather = await fetchWeatherSnapshot(input);
  } catch {
    weather = {
      location: input.city || "unknown",
      temperature: null,
      windSpeed: 0,
      precipitation: 0,
      weatherCode: null,
      summary: "unavailable",
      tags: [],
    };
  }

  try {
    news = await fetchNewsSnapshot(input.headlineTopic || "natural wine");
  } catch {
    news = {
      topic: input.headlineTopic || "natural wine",
      items: [],
      tags: [],
    };
  }

  const dj = {
    notes: context.djNotes || trackNotes || "",
    tags: djTags([input.djNotes, trackNotes].filter(Boolean).join(" · ")),
  };

  return {
    weather,
    news,
    dj,
    tags: [...new Set([...weather.tags, ...news.tags, ...dj.tags])],
  };
}
