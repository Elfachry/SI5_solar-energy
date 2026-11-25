import { calculateEstimate } from "./estimate.js";
import { PERFORMANCE_RATIO, UNCERTAINTY, CO2_KG_PER_KWH, CO2_KG_PER_TREE_YEAR, DEFAULT_PRICE, DEFAULT_CURRENCY, MIN_SYSTEM_WP, MAX_SYSTEM_WP } from "./config.js";

const $ = (id) => document.getElementById(id);
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
let location = null;
let solar = null;
let requestId = 0;
let lastEstimate = null;

const map = L.map("map").setView([-6.2, 106.8], 6);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
let marker;

function setLocation(lat, lon) {
  location = { lat, lon };
  if (marker) marker.setLatLng([lat, lon]);
  else marker = L.marker([lat, lon]).addTo(map);
  $("locationValue").textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  $("mapHint").textContent = "Location selected · click again to change";
  validate();
  if (lastEstimate) { solar = null; $("results").hidden = true; lastEstimate = null; }
}
map.on("click", (event) => setLocation(event.latlng.lat, event.latlng.lng));

$("locate").addEventListener("click", () => {
  if (!navigator.geolocation) { $("validation").textContent = "Location services are unavailable. Click the map instead."; return; }
  navigator.geolocation.getCurrentPosition((position) => {
    const { latitude, longitude } = position.coords;
    map.setView([latitude, longitude], 12); setLocation(latitude, longitude);
  }, () => { $("validation").textContent = "We couldn't access your location. Click the map instead."; });
});

function parseNumber(value) { return Number(String(value).replace(/,/g, "").trim()); }
function validate() {
  const wp = parseNumber($("systemWp").value); const price = parseNumber($("price").value); const costValue = $("cost").value.trim(); const cost = costValue ? parseNumber(costValue) : 0;
  const errors = [];
  if ($("systemWp").value.trim() && (!Number.isFinite(wp) || wp < MIN_SYSTEM_WP || wp > MAX_SYSTEM_WP)) errors.push(`System size must be between ${MIN_SYSTEM_WP} and ${numberFormat.format(MAX_SYSTEM_WP)} Wp.`);
  if (!Number.isFinite(price) || price <= 0) errors.push("Enter an electricity price above zero.");
  if (costValue && (!Number.isFinite(cost) || cost < 0)) errors.push("System cost must be a valid amount.");
  $("validation").textContent = errors.join(" ");
  const valid = Boolean(location && Number.isFinite(wp) && wp >= MIN_SYSTEM_WP && wp <= MAX_SYSTEM_WP && Number.isFinite(price) && price > 0 && (!costValue || (Number.isFinite(cost) && cost >= 0)));
  $("estimate").disabled = !valid;
  const helper = $("sizeHelper");
  if ($("systemWp").value.trim() && Number.isFinite(wp) && wp >= MIN_SYSTEM_WP && wp <= MAX_SYSTEM_WP) { helper.hidden = false; helper.textContent = `= ${decimalFormat.format(wp / 1000)} kWp`; } else helper.hidden = true;
  return valid;
}
["systemWp", "price", "cost"].forEach((id) => $(id).addEventListener("input", () => { if (validate() && solar) renderResults(); }));

async function loadSolar() {
  const current = ++requestId;
  $("results").hidden = false; $("loading").hidden = false; $("errorState").hidden = true; $("resultContent").hidden = true; $("estimate").disabled = true;
  try {
    const response = await fetch(`/api/solar?lat=${encodeURIComponent(location.lat)}&lon=${encodeURIComponent(location.lon)}`);
    if (!response.ok) throw new Error("solar request failed");
    const data = await response.json();
    if (current !== requestId) return;
    solar = data; $("loading").hidden = true; $("resultContent").hidden = false; renderResults();
  } catch { if (current !== requestId) return; $("loading").hidden = true; $("errorState").hidden = false; }
  validate();
}
$("estimateForm").addEventListener("submit", (event) => { event.preventDefault(); if (validate()) loadSolar(); });
$("retry").addEventListener("click", loadSolar);

function money(value) { return `${$("currency").value} ${numberFormat.format(value)}`; }
function compactMoney(value) { return value >= 1000000 ? `${$("currency").value} ${(value / 1000000).toFixed(2)}M` : money(value); }
function renderResults() {
  if (!solar || !validate()) return;
  const result = calculateEstimate({ systemWp: parseNumber($("systemWp").value), ghi: solar.ghi, pricePerKwh: parseNumber($("price").value), systemCost: parseNumber($("cost").value) || 0, PR: PERFORMANCE_RATIO, co2KgPerKwh: CO2_KG_PER_KWH, co2KgPerTreeYear: CO2_KG_PER_TREE_YEAR, uncertainty: UNCERTAINTY });
  if (!result) return; lastEstimate = result;
  $("yearly").textContent = `${numberFormat.format(result.yearlyKwh)} kWh`; $("daily").textContent = `≈ ${result.avgDailyKwh.toFixed(1)} kWh / day`;
  $("savingsCompact").textContent = compactMoney(result.savingsYear); $("savingsFull").textContent = `${money(result.savingsYear)} / yr`;
  const cost = parseNumber($("cost").value) || 0;
  $("payback").textContent = result.paybackYears === null ? "—" : result.paybackYears > 100 ? "100+ yrs" : `${result.paybackYears.toFixed(1)} yrs`;
  $("paybackSub").textContent = result.paybackYears === null ? "Add system cost to see payback" : `on a ${money(cost)} system`;
  $("packageNote").hidden = !cost; $("co2").textContent = `${numberFormat.format(result.co2Kg)} kg CO₂ avoided per year`; $("trees").textContent = `≈ like planting ${numberFormat.format(result.trees)} mature trees`;
  $("range").textContent = `Likely range: ${numberFormat.format(result.rangeLow)} – ${numberFormat.format(result.rangeHigh)} kWh / year`;
  const peak = result.monthlyKwh.indexOf(Math.max(...result.monthlyKwh)); const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; const max = Math.max(...result.monthlyKwh, 1);
  $("chart").innerHTML = "";
  result.monthlyKwh.forEach((value, index) => { const wrap = document.createElement("div"); wrap.className = "bar-wrap"; const bar = document.createElement("button"); bar.className = "bar"; bar.type = "button"; bar.style.height = `${Math.max(2, value / max * 100)}%`; bar.setAttribute("aria-label", `${months[index]}: ${numberFormat.format(value)} kWh`); const text = document.createElement("span"); text.textContent = `${numberFormat.format(value)} kWh`; bar.append(text); const label = document.createElement("small"); label.className = "bar-month"; label.textContent = months[index]; wrap.append(bar, label); $("chart").append(wrap); });
  $("chart").setAttribute("aria-label", `Monthly production chart. Peak month ${months[peak]} at ${numberFormat.format(result.monthlyKwh[peak])} kWh. Total ${numberFormat.format(result.yearlyKwh)} kWh.`); $("chartTotal").textContent = `${numberFormat.format(result.yearlyKwh)} kWh / year`; $("chartLabel").textContent = `Peak: ${months[peak]} · tap a bar for details`; 
}

$("currency").addEventListener("change", () => { if (solar) renderResults(); });
$("howCalculated").addEventListener("click", () => {
  if (!solar || !lastEstimate) return; const wp = parseNumber($("systemWp").value); const cost = parseNumber($("cost").value) || 0;
  const steps = [{ title: "Sunshine at your spot", text: `${solar.ghiAnnual.toFixed(2)} kWh/m²/day annual average GHI from NASA POWER long-term averages.` }, { title: "Your system size", text: `${numberFormat.format(wp)} Wp (= ${decimalFormat.format(wp / 1000)} kWp).` }, { title: "Real-world losses", text: `Heat, dust, wiring and the inverter cost about 20–25%, so we assume your system delivers about ${Math.round(PERFORMANCE_RATIO * 100)}% of ideal.` }, { title: "Energy & savings", text: `${numberFormat.format(lastEstimate.yearlyKwh)} kWh/year × ${money(parseNumber($("price").value))} = ${money(lastEstimate.savingsYear)} savings/year.` }, { title: "Payback & CO₂", text: cost ? `${money(cost)} ÷ savings = ${lastEstimate.paybackYears > 100 ? "100+" : lastEstimate.paybackYears.toFixed(1)} years. CO₂ uses ${CO2_KG_PER_KWH} kg per kWh.` : `Add a system cost to calculate payback. CO₂ uses ${CO2_KG_PER_KWH} kg per kWh.` }];
  $("modalBody").replaceChildren(...steps.map((step) => { const item = document.createElement("div"); item.className = "modal-step"; const title = document.createElement("strong"); title.textContent = step.title; const text = document.createElement("p"); text.textContent = step.text; item.append(title, text); return item; })); $("explainModal").showModal(); $("closeModal").focus();
});
$("closeModal").addEventListener("click", () => $("explainModal").close()); $("explainModal").addEventListener("click", (event) => { if (event.target === $("explainModal")) $("explainModal").close(); });
$("currency").value = DEFAULT_CURRENCY; $("price").value = DEFAULT_PRICE.toLocaleString("en-US"); validate();
