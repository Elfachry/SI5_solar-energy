import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PUBLIC = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "public",
);

app.use(express.json());
const readings = [];
const solarCache = new Map();
const MAX_CACHE_ENTRIES = 500;

// Pages
app.get(["/", "/simulation", "/simulation/"], (req, res) => {
  const page = req.path === "/" ? "index.html" : "simulation/index.html";
  res.sendFile(page, { root: PUBLIC });
});

// css, js and other files in public/
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(req.path, { root: PUBLIC }, (err) => {
    if (err && !res.headersSent) next();
  });
});

const SOURCES = new Set(["sensor", "simulation"]);

app.post("/api/readings", (req, res) => {
  const key = process.env.INGEST_KEY;
  if (!key || req.get("x-api-key") !== key)
    return res.status(401).json({ error: "unauthorized" });

  const { time, lux, volt, amp, source } = req.body ?? {};
  const nums = [lux, volt, amp].map(Number);
  if (
    !SOURCES.has(source) ||
    Number.isNaN(Date.parse(time)) ||
    nums.some((n) => !Number.isFinite(n) || n < 0)
  )
    return res.status(400).json({ error: "invalid reading" });

  readings.push({
    time,
    source,
    lux: nums[0],
    volt: nums[1],
    amp: nums[2],
    power: nums[1] * nums[2],
  });
  if (readings.length > 5000) readings.shift();
  res.json({ ok: true });
});

app.get("/api/readings", (req, res) => {
  res.json(readings.slice(-500));
});

function parseCoordinate(value, name, min, max) {
  if (value === undefined || value === "" || !Number.isFinite(Number(value))) {
    return { error: `${name} must be a number` };
  }
  const number = Number(value);
  if (number < min || number > max) {
    return { error: `${name} must be between ${min} and ${max}` };
  }
  return { value: number };
}

app.get("/api/solar", async (req, res) => {
  const lat = parseCoordinate(req.query.lat, "lat", -90, 90);
  const lon = parseCoordinate(req.query.lon, "lon", -180, 180);
  if (lat.error || lon.error) {
    return res.status(400).json({ error: lat.error || lon.error });
  }

  const roundedLat = Math.round(lat.value * 100) / 100;
  const roundedLon = Math.round(lon.value * 100) / 100;
  const key = `${roundedLat},${roundedLon}`;

  res.set(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=604800",
  );
  if (solarCache.has(key)) return res.json(solarCache.get(key));

  const url = new URL(
    "https://power.larc.nasa.gov/api/temporal/climatology/point",
  );
  url.search = new URLSearchParams({
    parameters: "ALLSKY_SFC_SW_DWN",
    community: "RE",
    latitude: String(roundedLat),
    longitude: String(roundedLon),
    format: "JSON",
  });

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`NASA POWER returned ${response.status}`);
    const payload = await response.json();
    const parameter = payload?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
    const months = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];
    const ghi = months.map((month) => Number(parameter?.[month]));
    const ghiAnnual = Number(parameter?.ANN);
    if (
      ghi.length !== 12 ||
      ghi.some(
        (value) => !Number.isFinite(value) || value <= 0 || value >= 12,
      ) ||
      !Number.isFinite(ghiAnnual) ||
      ghiAnnual <= 0 ||
      ghiAnnual >= 12
    )
      throw new Error("NASA POWER returned unusable irradiance data");

    const result = {
      lat: roundedLat,
      lon: roundedLon,
      source: "NASA POWER",
      ghi,
      ghiAnnual,
    };
    solarCache.set(key, result);
    if (solarCache.size > MAX_CACHE_ENTRIES)
      solarCache.delete(solarCache.keys().next().value);
    return res.json(result);
  } catch (error) {
    res.set("Cache-Control", "no-store"); // don't cache failures
    return res
      .status(502)
      .json({ error: "Solar data is temporarily unavailable" });
  }
});

// Local only. Vercel runs the exported app itself.
if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`http://localhost:${port}`));
}

export { app };
export default app;
