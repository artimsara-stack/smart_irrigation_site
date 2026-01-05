// app.js — Smart Irrigation Dashboard (REST from Firebase RTDB)

const DB_URL =
  "https://smart-irrigation-site-90e51-default-rtdb.firebaseio.com/last.json";

// UI elements (IDs from your HTML)
const el = {
  connDot: document.getElementById("connDot"),
  connText: document.getElementById("connText"),
  airTemp: document.getElementById("airTemp"),
  airRH: document.getElementById("airRH"),
  soil: document.getElementById("soil"),
  lux: document.getElementById("lux"),
  ppfd: document.getElementById("ppfd"),
  pumpPeriod: document.getElementById("pumpPeriod"),
  lastUpdate: document.getElementById("lastUpdate"),
};

// ---------- Helpers ----------
function setText(node, value) {
  if (!node) return;
  node.textContent =
    value === undefined || value === null || value === "" ? "--" : String(value);
}

// format numbers safely (prevents flicker / errors)
function fmtNumber(v, digits = 1) {
  if (typeof v !== "number" || Number.isNaN(v)) return "--";
  return v.toFixed(digits);
}

function setConnected(ok, msg) {
  if (el.connDot) el.connDot.style.background = ok ? "#22c55e" : "#ef4444";
  setText(el.connText, msg);
}

// ---------- Charts ----------
let tempChart = null;
let soilChart = null;

const tempSeries = { labels: [], values: [] };
const soilSeries = { labels: [], values: [] };

function pushPoint(series, label, value, maxPoints = 30) {
  series.labels.push(label);
  series.values.push(value);
  while (series.labels.length > maxPoints) {
    series.labels.shift();
    series.values.shift();
  }
}

function ensureCharts() {
  if (!window.Chart) return;

  if (!tempChart) {
    const ctx = document.getElementById("tempChart")?.getContext("2d");
    if (ctx) {
      tempChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: tempSeries.labels,
          datasets: [{ label: "Air Temp (°C)", data: tempSeries.values, tension: 0.3 }],
        },
        options: { responsive: true, animation: false, scales: { y: { beginAtZero: false } } },
      });
    }
  }

  if (!soilChart) {
    const ctx = document.getElementById("soilChart")?.getContext("2d");
    if (ctx) {
      soilChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: soilSeries.labels,
          datasets: [{ label: "Soil (%)", data: soilSeries.values, tension: 0.3 }],
        },
        options: { responsive: true, animation: false, scales: { y: { min: 0, max: 100 } } },
      });
    }
  }
}

// ---------- Main fetch loop ----------
async function loadLast() {
  try {
    const res = await fetch(DB_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);

    const d = await res.json();
    if (!d || typeof d !== "object") throw new Error("No data at /last");

    // Read values (from your Firebase JSON keys)
    const air_temp = d.air_temp; // number
    const air_rh = d.air_rh; // number
    const soil_pct = d.soil_pct; // number
    const lux = d.lux; // number
    const ppfd = d.ppfd; // number
    const pump = d.pump; // "ON"/"OFF"
    const crop = d.crop; // "tomate" (optional)
    const irrig_ms = d.irrig_ms; // optional
    // period not present in your JSON, so we show crop/irrig_ms instead

    // Update KPI cards (NO flicker)
    setText(el.airTemp, fmtNumber(air_temp, 1));
    setText(el.airRH, fmtNumber(air_rh, 1));
    setText(el.soil, fmtNumber(soil_pct, 1));
    setText(el.lux, typeof lux === "number" ? String(Math.round(lux)) : "--");
    setText(el.ppfd, fmtNumber(ppfd, 2));

    // Pump / Period card (custom display)
    let pumpLine = pump ?? "--";
    if (crop) pumpLine += ` • ${crop}`;
    if (typeof irrig_ms === "number") pumpLine += ` • ${irrig_ms}ms`;
    setText(el.pumpPeriod, pumpLine);

    // Timestamp
    setText(el.lastUpdate, new Date().toLocaleString());

    // Charts
    ensureCharts();
    const label = new Date().toLocaleTimeString();

    if (typeof air_temp === "number") {
      pushPoint(tempSeries, label, air_temp);
      tempChart?.update();
    }

    if (typeof soil_pct === "number") {
      pushPoint(soilSeries, label, soil_pct);
      soilChart?.update();
    }

    setConnected(true, "Firebase OK ✅");
  } catch (e) {
    console.error("Dashboard error:", e);
    // IMPORTANT: we do NOT overwrite values with "--" here (prevents flicker)
    setConnected(false, "Connexion instable…");
  }
}

// Start
setConnected(false, "Connexion…");
loadLast();
setInterval(loadLast, 2000);
