let minutes = 8 * 60; // start at 08:00

setInterval(() => {
  const base = Math.max(0, Math.sin((Math.PI * (minutes / 60 - 6)) / 12));
  const sun = base * (0.9 + Math.random() * 0.1); // 10% noise

  fetch("http://localhost:3000/api/readings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      time: new Date(
        new Date().setHours(0, 0, 0, 0) + minutes * 60000,
      ).toISOString(),
      lux: Math.round(80000 * sun),
      volt: +(5.5 * sun).toFixed(3),
      amp: +(0.5 * sun).toFixed(4),
      source: "simulation",
    }),
  });

  minutes += 5;
}, 500);
