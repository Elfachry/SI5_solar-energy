import express from "express";

const app = express();

app.use(express.json());
app.use(express.static("public"));

const readings = [];

app.post("/api/readings", (req, res) => {
  const { lux, volt, amp } = req.body;

  readings.push({
    time: new Date().toISOString(),
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

app.listen(3000, () => console.log("http://localhost:3000"))