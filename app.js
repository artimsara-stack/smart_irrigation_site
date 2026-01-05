// app.js — reads Firebase RTDB via REST and updates the dashboard

const DB_URL = "https://smart-irrigation-site-90e51-default-rtdb.firebaseio.com/last.json";

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

// Simple helpers
function setText(node, value) {
  if (!node) return;
  node.textContent = (value === undefined || value === null) ? "--" : value;
}

function setConnected(ok, msg) {
  if (el.connDot) el.connDot.style.background = ok ? "#22c55e" : "#ef4444"; // green/red
  setText(el.connText, msg);
}

// Charts (Chart.js already loaded in HTML)
let tempChart, soilChart;
const tempData = { labels: [], values: [] };
const soilData = { labels: [], values: [] };

function pushPoint(store, label, value, maxPoints = 30) {
  store.labels.push(label);
  store.values.push(value);
  if (store.labels.length > maxPoints) {
    store.labels.shift();
    store.values.shift();
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
          labels: tempData.labels,
          datasets: [{ label: "Air Temp (°C)", data: tempData.values, tension: 0.3 }]
        },
        options: { responsive: true, animation: false, scales: { y: { beginAtZero: false } } }
      });
    }
  }

  if (!soilChart) {
    const ctx = document.getElementById("soilChart")?.getContext("2d");
    if (ctx) {
      soilChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: soilData.labels,
          datasets: [{ label: "Soil (%)", data: soilData.values, tension: 0.3 }]
        },
        options: { responsive: true, animation: false, scales: { y: { min: 0, max: 100 } } }
      });
    }
  }
}

async function loadLast() {
  try {
    const res = await fetch(DB_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);

    const d = await res.json();
    if (!d) throw new Error("No data at /last");

    // Format values
    const airT = (typeof d.air_temp === "number") ? d.air_temp.toFixed(1) : d.air_temp;
    const rh   = (typeof d.air_rh === "number") ? d.air_rh.toFixed(1) : d.air_rh;

    // soil can be "soil_pct" in your JSON
    const soilPct = (typeof d.soil_pct === "number") ? d.soil_pct.toFixed(1) : d.soil_pct;

    const lux  = (typeof d.lux === "number") ? d.lux.toFixed(0) : d.lux;
    const ppfd = (typeof d.ppfd === "number") ? d.ppfd.toFixed(2) : d.ppfd;

    // Update KPI cards
    setText(el.airTemp, airT);
    setText(el.airRH, rh);
    setText(el.soil, soilPct);
    setText(el.lux, lux);
    setText(el.ppfd, ppfd);

    // Pump / Period card: show pump + crop (or period if you have it later)
    const pump = d.pump ?? "--";
    const crop = d.crop ?? "";
    setText(el.pumpPeriod, crop ? `${pump} • ${crop}` : pump);

    // Update time
    setText(el.lastUpdate, new Date().toLocaleString());

    // Charts
    ensureCharts();
    const tLabel = new Date().toLocaleTimeString();
    if (typeof d.air_temp === "number") {
      pushPoint(tempData, tLabel, d.air_temp);
      tempChart?.update();
    }
    if (typeof d.soil_pct === "number") {
      pushPoint(soilData, tLabel, d.soil_pct);
      soilChart?.update();
    }

    setConnected(true, "Connected ✅");
  } catch (e) {
    console.error(e);
    setConnected(false, "Erreur Firebase ❌");
  }
}

// Start
setConnected(false, "Connexion…");
loadLast();
setInterval(loadLast, 2000);
