import { calculateEstimate } from "./estimate.js";
import {
  PERFORMANCE_RATIO,
  UNCERTAINTY,
  CO2_KG_PER_KWH,
  CO2_KG_PER_TREE_YEAR,
  DEFAULT_PRICE,
  DEFAULT_CURRENCY,
  DEFAULT_PANEL_WP,
  DEFAULT_PANEL_COUNT,
  MIN_SYSTEM_WP,
  MAX_SYSTEM_WP,
  MAX_PANEL_WP,
  MAX_PANELS,
} from "./config.js";

const $ = (id) => document.getElementById(id);
const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const decimalFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
let location = null;
let solar = null;
let requestId = 0;
let lastEstimate = null;

const PIN_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" fill="white" /></svg>';
const pinIcon = L.divIcon({
  className: "map-pin",
  html: PIN_SVG,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

// Zoom buttons and attribution are drawn by the page itself (see index.html).
const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
}).setView([-6.2, 106.8], 6);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);
let marker;

function setResultsVisible(visible) {
  $("results").hidden = !visible;
  document.body.classList.toggle("has-results", visible);
}

function setLocation(lat, lon) {
  location = { lat, lon };
  if (marker) marker.setLatLng([lat, lon]);
  else
    marker = L.marker([lat, lon], {
      icon: pinIcon,
      interactive: false,
      keyboard: false,
    }).addTo(map);
  $("locationText").textContent = "Location selected";
  $("coordinates").textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  $("location").classList.add("active");
  $("mapHint").hidden = true;
  validate();
  if (lastEstimate) {
    solar = null;
    setResultsVisible(false);
    lastEstimate = null;
  }
}
map.on("click", (event) => setLocation(event.latlng.lat, event.latlng.lng));
$("zoomIn").addEventListener("click", () => map.zoomIn());
$("zoomOut").addEventListener("click", () => map.zoomOut());

$("locate").addEventListener("click", () => {
  if (!navigator.geolocation) {
    $("validation").textContent =
      "Location services are unavailable. Click the map instead.";
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      map.setView([latitude, longitude], 12);
      setLocation(latitude, longitude);
    },
    () => {
      $("validation").textContent =
        "We couldn't access your location. Click the map instead.";
    },
  );
});

function parseNumber(value) {
  return Number(String(value).replace(/,/g, "").trim());
}
function validate() {
  const wattsText = $("watts").value.trim();
  const countText = $("count").value.trim();
  const panelWp = parseNumber(wattsText);
  const panels = parseNumber(countText);
  const price = parseNumber($("price").value);
  const costValue = $("cost").value.trim();
  const cost = costValue ? parseNumber(costValue) : 0;
  const wattsOk =
    Number.isFinite(panelWp) &&
    panelWp >= MIN_SYSTEM_WP &&
    panelWp <= MAX_PANEL_WP;
  const countOk =
    Number.isInteger(panels) && panels >= 1 && panels <= MAX_PANELS;
  const totalWp = wattsOk && countOk ? panelWp * panels : NaN;
  const totalOk = totalWp >= MIN_SYSTEM_WP && totalWp <= MAX_SYSTEM_WP;
  const errors = [];
  if (wattsText && !wattsOk)
    errors.push(
      `Panel output must be between ${MIN_SYSTEM_WP} and ${numberFormat.format(MAX_PANEL_WP)} Wp.`,
    );
  if (countText && !countOk)
    errors.push(
      `Number of panels must be a whole number from 1 to ${MAX_PANELS}.`,
    );
  if (wattsOk && countOk && !totalOk)
    errors.push(
      `System size can't exceed ${numberFormat.format(MAX_SYSTEM_WP)} Wp.`,
    );
  if (!Number.isFinite(price) || price <= 0)
    errors.push("Enter an electricity price above zero.");
  if (costValue && (!Number.isFinite(cost) || cost < 0))
    errors.push("System cost must be a valid amount.");
  $("validation").textContent = errors.join(" ");
  const valid = Boolean(
    location &&
    totalOk &&
    Number.isFinite(price) &&
    price > 0 &&
    (!costValue || (Number.isFinite(cost) && cost >= 0)),
  );
  $("estimate").disabled = !valid;
  const helper = $("sizeHelper");
  if (totalOk) {
    helper.hidden = false;
    helper.textContent = `Total ${numberFormat.format(totalWp)} Wp (= ${decimalFormat.format(totalWp / 1000)} kWp)`;
  } else helper.hidden = true;
  return valid;
}
function systemWp() {
  return parseNumber($("watts").value) * parseNumber($("count").value);
}
function onFormChange() {
  if (validate() && solar) renderResults();
}
["watts", "count", "price", "cost"].forEach((id) =>
  $(id).addEventListener("input", onFormChange),
);
function stepPanels(delta) {
  const current = Math.round(parseNumber($("count").value)) || 1;
  $("count").value = String(Math.min(MAX_PANELS, Math.max(1, current + delta)));
  onFormChange();
}
$("minus").addEventListener("click", () => stepPanels(-1));
$("plus").addEventListener("click", () => stepPanels(1));

async function loadSolar() {
  const current = ++requestId;
  setResultsVisible(true);
  $("loading").hidden = false;
  $("errorState").hidden = true;
  $("resultContent").hidden = true;
  $("estimate").disabled = true;
  try {
    const response = await fetch(
      `/api/solar?lat=${encodeURIComponent(location.lat)}&lon=${encodeURIComponent(location.lon)}`,
    );
    if (!response.ok) throw new Error("solar request failed");
    const data = await response.json();
    if (current !== requestId) return;
    solar = data;
    $("loading").hidden = true;
    $("resultContent").hidden = false;
    renderResults();
  } catch {
    if (current !== requestId) return;
    $("loading").hidden = true;
    $("errorState").hidden = false;
  }
  validate();
}
$("estimateForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (validate()) loadSolar();
});
$("retry").addEventListener("click", loadSolar);
$("close").addEventListener("click", () => setResultsVisible(false));

function money(value) {
  return `${$("currency").value} ${numberFormat.format(value)}`;
}
function compactMoney(value) {
  return value >= 1000000
    ? `${$("currency").value} ${(value / 1000000).toFixed(2)}M`
    : money(value);
}
// Big number with a small unit beside it, e.g. "4,717 kWh".
function setValue(id, text, unit) {
  const element = $(id);
  element.textContent = text;
  if (unit) {
    const small = document.createElement("em");
    small.textContent = ` ${unit}`;
    element.append(small);
  }
}
function renderResults() {
  if (!solar || !validate()) return;
  const result = calculateEstimate({
    systemWp: systemWp(),
    ghi: solar.ghi,
    pricePerKwh: parseNumber($("price").value),
    systemCost: parseNumber($("cost").value) || 0,
    PR: PERFORMANCE_RATIO,
    co2KgPerKwh: CO2_KG_PER_KWH,
    co2KgPerTreeYear: CO2_KG_PER_TREE_YEAR,
    uncertainty: UNCERTAINTY,
  });
  if (!result) return;
  lastEstimate = result;
  setValue("yearly", numberFormat.format(result.yearlyKwh), "kWh");
  $("daily").textContent = `≈ ${result.avgDailyKwh.toFixed(1)} kWh / day`;
  $("savingsCompact").textContent = compactMoney(result.savingsYear);
  $("savingsFull").textContent = `${money(result.savingsYear)} / yr`;
  const cost = parseNumber($("cost").value) || 0;
  if (result.paybackYears === null) setValue("payback", "—");
  else
    setValue(
      "payback",
      result.paybackYears > 100 ? "100+" : result.paybackYears.toFixed(1),
      "yrs",
    );
  $("paybackSub").textContent =
    result.paybackYears === null
      ? "Add system cost to see payback"
      : `on a ${money(cost)} system`;
  $("packageNote").hidden = !cost;
  $("co2").textContent = `${numberFormat.format(result.co2Kg)} kg CO₂`;
  $("trees").textContent =
    `Like planting ${numberFormat.format(result.trees)} mature trees`;
  $("range").textContent =
    `Likely range: ${numberFormat.format(result.rangeLow)} – ${numberFormat.format(result.rangeHigh)} kWh / year`;
  const peak = result.monthlyKwh.indexOf(Math.max(...result.monthlyKwh));
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const max = Math.max(...result.monthlyKwh, 1);
  $("chart").innerHTML = "";
  result.monthlyKwh.forEach((value, index) => {
    const bar = document.createElement("button");
    bar.className = index === peak ? "bar peak" : "bar";
    bar.type = "button";
    bar.style.setProperty("--p", String(value / max));
    bar.dataset.value = `${numberFormat.format(value)} kWh`;
    bar.setAttribute(
      "aria-label",
      `${months[index]}: ${numberFormat.format(value)} kWh`,
    );
    const fill = document.createElement("i");
    const label = document.createElement("small");
    label.textContent = months[index];
    bar.append(fill, label);
    $("chart").append(bar);
  });
  $("chart").setAttribute(
    "aria-label",
    `Monthly production chart. Peak month ${months[peak]} at ${numberFormat.format(result.monthlyKwh[peak])} kWh. Total ${numberFormat.format(result.yearlyKwh)} kWh.`,
  );
  $("chartTotal").textContent =
    `${numberFormat.format(result.yearlyKwh)} kWh / year`;
  $("chartLabel").textContent = `Peak: ${months[peak]} · tap a bar for details`;
}

$("currency").addEventListener("change", () => {
  $("costUnit").textContent = $("currency").value;
  if (solar) renderResults();
});
$("howCalculated").addEventListener("click", () => {
  if (!solar || !lastEstimate) return;
  const wp = systemWp();
  const cost = parseNumber($("cost").value) || 0;
  const steps = [
    {
      icon: "☼",
      title: "Sunshine at your spot",
      text: `${solar.ghiAnnual.toFixed(2)} kWh/m²/day annual average GHI from NASA POWER long-term averages.`,
    },
    {
      icon: "▦",
      title: "Your system size",
      text: `${numberFormat.format(parseNumber($("count").value))} panels × ${numberFormat.format(parseNumber($("watts").value))} Wp = ${numberFormat.format(wp)} Wp (= ${decimalFormat.format(wp / 1000)} kWp).`,
    },
    {
      icon: "↘",
      title: "Real-world losses",
      text: `Heat, dust, wiring and the inverter cost about 20–25%, so we assume your system delivers about ${Math.round(PERFORMANCE_RATIO * 100)}% of ideal.`,
    },
    {
      icon: "↗",
      title: "Energy & savings",
      text: `${numberFormat.format(lastEstimate.yearlyKwh)} kWh/year × ${money(parseNumber($("price").value))} = ${money(lastEstimate.savingsYear)} savings/year.`,
    },
    {
      icon: "◷",
      title: "Payback & CO₂",
      text: cost
        ? `${money(cost)} ÷ savings = ${lastEstimate.paybackYears > 100 ? "100+" : lastEstimate.paybackYears.toFixed(1)} years. CO₂ uses ${CO2_KG_PER_KWH} kg per kWh.`
        : `Add a system cost to calculate payback. CO₂ uses ${CO2_KG_PER_KWH} kg per kWh.`,
    },
  ];
  $("modalBody").replaceChildren(
    ...steps.map((step) => {
      const row = document.createElement("div");
      row.className = "modal-row";
      const icon = document.createElement("span");
      icon.className = "icon-box";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = step.icon;
      const body = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = step.title;
      const text = document.createElement("p");
      text.textContent = step.text;
      body.append(title, text);
      row.append(icon, body);
      return row;
    }),
  );
  $("explainModal").showModal();
  $("closeModal").focus();
});
$("closeModal").addEventListener("click", () => $("explainModal").close());
$("explainModal").addEventListener("click", (event) => {
  if (event.target === $("explainModal")) $("explainModal").close();
});
$("currency").value = DEFAULT_CURRENCY;
$("costUnit").textContent = DEFAULT_CURRENCY;
$("price").value = DEFAULT_PRICE.toLocaleString("en-US");
$("watts").value = String(DEFAULT_PANEL_WP);
$("count").value = String(DEFAULT_PANEL_COUNT);
validate();
