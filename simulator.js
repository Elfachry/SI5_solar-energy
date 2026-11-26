let minutes = 8 * 60; // start at 08:00

const URL = process.env.API_URL || "http://localhost:3000/api/readings";
const KEY = process.env.INGEST_KEY;

if (!KEY) {
  console.error(
    "INGEST_KEY is missing. Run with: node --env-file=.env simulator.js",
  );
  process.exit(1);
}

setInterval(async () => {
  const base = Math.max(0, Math.sin((Math.PI * (minutes / 60 - 6)) / 12));
  const sun = base * (0.9 + Math.random() * 0.1); // 10% noise

  const data = {
    time: new Date(
      new Date().setHours(0, 0, 0, 0) + minutes * 60000,
    ).toISOString(),
    lux: Math.round(80000 * sun),
    volt: +(5.5 * sun).toFixed(3),
    amp: +(0.5 * sun).toFixed(4),
    source: "simulation",
  };

  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": KEY,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) console.error("Server replied", res.status, await res.text());
    else console.log(data);
  } catch (err) {
    console.error("Could not reach server:", err.message);
  }

  minutes += 5;
}, 500);
