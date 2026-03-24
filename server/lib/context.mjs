import Parser from "rss-parser";

const parser = new Parser();

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
    notes: input.djNotes || "",
    tags: djTags(input.djNotes),
  };

  return {
    weather,
    news,
    dj,
    tags: [...new Set([...weather.tags, ...news.tags, ...dj.tags])],
  };
}
