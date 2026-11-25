import express from "express";

const app = express();

app.use(express.json());
const readings = [];
const solarCache = new Map();
const MAX_CACHE_ENTRIES = 500;

app.get("/", (req, res) => res.sendFile("index.html", { root: "public" }));
app.get("/simulation", (req, res) =>
  res.sendFile("simulation/index.html", { root: "public" }),
);
app.get("/simulation/", (req, res) =>
  res.sendFile("simulation/index.html", { root: "public" }),
);
app.use(express.static("public"));

app.post("/api/readings", (req, res) => {
  const { time, lux, volt, amp, source } = req.body;

  readings.push({
    time,
    source,
    lux,
    volt,
    amp,
    power: volt * amp,
  });

  res.json({ ok: true });
});

app.get("/api/readings", (req, res) => {
  res.json(readings);
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
    return res
      .status(502)
      .json({ error: "Solar data is temporarily unavailable" });
  }
});

if (process.env.NODE_ENV !== "test") {
  app.listen(3000, () => console.log("http://localhost:3000"));
}

export { app };
