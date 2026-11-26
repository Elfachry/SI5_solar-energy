# Solar Monitor

A small web project with two pages: a roof solar estimator on a map, and a live dashboard that shows light, voltage, current and power readings from a solar panel.

## Pages

The roof estimator is at `/` and lets you pick a location and roof size to estimate energy output and savings. The dashboard is at `/simulation` and shows live readings, energy produced, estimated savings in Rupiah, and the correlation between light and power.

## Setup

Requires Node.js 20.6 or newer.

```bash
npm install
```

Create a `.env` file in the project root:

```
INGEST_KEY=your-long-random-key
```

Generate a random key with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

`.env` is listed in `.gitignore`. Never commit it, and never put the key in any file inside `public/`.

## Run locally

```bash
npm start
```

Open `http://localhost:3000`. The dashboard reads data from `/api/readings`.

`npm start` runs `node --env-file=.env server.js`, so the server loads the key from `.env`.

## Demo without hardware

Open the dashboard and press Run demo. It generates a simulated day from 08:00 to 18:00 in the browser and sends nothing to the server. Refresh the page to go back to live data.

To feed simulated readings to the server instead, start the server, then in a second terminal run:

```bash
npm run simulate
```

It posts a new reading every 500ms to `/api/readings`. To send to a deployed site instead of localhost, set `API_URL`:

```bash
API_URL=https://your-project.vercel.app/api/readings npm run simulate
```

On Windows PowerShell use:

```powershell
$env:API_URL="https://your-project.vercel.app/api/readings"; npm run simulate
```

## API

| Endpoint                   | Method | Auth               | Description                                      |
| -------------------------- | ------ | ------------------ | ------------------------------------------------ |
| `/api/readings`            | GET    | none               | Returns the last 500 readings                    |
| `/api/readings`            | POST   | `x-api-key` header | Adds one reading                                 |
| `/api/solar?lat=..&lon=..` | GET    | none               | Monthly solar irradiance from NASA POWER, cached |

A reading looks like this:

```json
{
  "time": "2026-11-26T10:00:00.000Z",
  "lux": 54000,
  "volt": 4.2,
  "amp": 0.31,
  "source": "sensor"
}
```

`source` must be `sensor` or `simulation`. Power is calculated by the server as `volt * amp`. Requests without a valid key get `401`, and invalid values get `400`.

Sensors and scripts must send the key in a header:

```
x-api-key: your-long-random-key
```

## Deploy on Vercel

1. Push the project to GitHub. `package.json`, `server.js` and `public/` must be at the top level of the repo.
2. Go to vercel.com/new, import the repo and click Deploy. Leave the build command empty.
3. In Project, Settings, Environment Variables, add `INGEST_KEY` with your key, then redeploy.

`vercel.json` bundles `public/` into the function so Express can serve the pages:

```json
{
  "cleanUrls": true,
  "functions": {
    "server.js": { "includeFiles": "public/**" }
  }
}
```

You can also deploy from the command line with `npx vercel`, then `npx vercel --prod`.

## Limitations

- Readings are stored in memory (the last 5000). On Vercel the server can restart or run as several copies, so live sensor data may disappear or look inconsistent. The roof estimator and the in-browser demo are not affected. For reliable storage, use a database such as Upstash Redis or Neon, or host the readings endpoint on a server that stays running.
- Anyone can read `/api/readings`. Only the write endpoint is protected by the key.
- The estimator uses NASA POWER climate averages, so results are estimates (about 10% uncertainty).

## Built with

Plain HTML, CSS and JavaScript, Leaflet for the map, and Chart.js for the charts. The server is Express. The Pearson correlation is calculated in the page itself.
