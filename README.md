# Solar Monitor

A small web project with two pages: a roof solar estimator on a map, and a live dashboard that shows light, voltage, current and power readings from a solar panel.

## Pages

The roof estimator is at `/` and lets you pick a location and roof size to estimate energy output and savings. The dashboard is at `/simulation` and shows live readings, energy produced, estimated savings in Rupiah, and the correlation between light and power.

## Run

Start the server with `node server.js` and open `http://localhost:3000`. The dashboard reads data from `/api/readings`.

## Demo without hardware

Open the dashboard and press Run demo. It generates a simulated day from 08:00 to 18:00 in the browser and sends nothing to the server. Refresh the page to go back to live data.

To feed simulated readings to the server instead, run `node simulator.js`. It posts a new reading every 500ms to `/api/readings`.

## Built with

Plain HTML, CSS and JavaScript, Leaflet for the map, and Chart.js for the charts. The Pearson correlation is calculated in the page itself.
