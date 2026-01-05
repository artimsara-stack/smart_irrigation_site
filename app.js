// ================== Firebase Realtime Database ==================
const DB_URL = "https://smart-irrigation-site-90e51-default-rtdb.firebaseio.com/.json
";

// DOM helpers
const $ = (id) => document.getElementById(id);

// Cards (IDs خاصهم يكونو فـ index.html)
const elAirTemp = $("airTemp");
const elAirRH   = $("airRH");
const elSoil    = $("soil");
const elLux     = $("lux");
const elPPFD    = $("ppfd");
const elPump    = $("pump");

// Simple chart data arrays
let labels = [];
let airTempData = [];
let soilData = [];

// Chart.js instances (إذا عندك Chart.js فـ index.html)
let airChart, soilChart;

function safeText(el, v, suffix="") {
  if (!el) return;
  if (v === null || v === undefined || Number.isNaN(v)) el.textContent = "--";
  else el.textContent = `${v}${suffix}`;
}

async function fetchLatest() {
  // /latest.json : Realtime DB requires .json
  const res = await fetch(`${DB_URL}/latest.json`);
  if (!res.ok) throw new Error("Fetch failed");
  return await res.json();
}

function initCharts() {
  const airCtx = document.getElementById("airChart");
  const soilCtx = document.getElementById("soilChart");
  if (!airCtx || !soilCtx || typeof Chart === "undefined") return;

  airChart = new Chart(airCtx, {
    type: "line",
    data: { labels, datasets: [{ label: "Air Temp (°C)", data: airTempData }] },
    options: { responsive: true, animation: false }
  });

  soilChart = new Chart(soilCtx, {
    type: "line",
    data: { labels, datasets: [{ label: "Soil (%)", data: soilData }] },
    options: { responsive: true, animation: false }
  });
}

function pushPoint(t, airT, soil) {
  const now = new Date();
  const label = now.toLocaleTimeString();

  labels.push(label);
  airTempData.push(airT);
  soilData.push(soil);

  // keep last 30 points
  if (labels.length > 30) {
    labels.shift(); airTempData.shift(); soilData.shift();
  }

  if (airChart) airChart.update();
  if (soilChart) soilChart.update();
}

async function updateUI() {
  try {
    const d = await fetchLatest();
    if (!d) return;

    // توقع شكل الداتا اللي كيصيفتها ESP32
    // مثال: { air_temp: 23.4, air_rh: 55.1, soil: 62.0, lux: 120, ppfd: 2.3, pump:"ON", period:"DAY" }
    safeText(elAirTemp, d.air_temp?.toFixed ? d.air_temp.toFixed(1) : d.air_temp, " °C");
    safeText(elAirRH,   d.air_rh?.toFixed ? d.air_rh.toFixed(1) : d.air_rh, " %");
    safeText(elSoil,    d.soil?.toFixed ? d.soil.toFixed(1) : d.soil, " %");
    safeText(elLux,     d.lux ?? d.lux, "");
    safeText(elPPFD,    d.ppfd?.toFixed ? d.ppfd.toFixed(1) : d.ppfd, "");
    safeText(elPump,    `${d.pump ?? "--"} / ${d.period ?? "--"}`);

    // charts
    const airT = Number(d.air_temp);
    const soil = Number(d.soil);
    if (!Number.isNaN(airT) && !Number.isNaN(soil)) {
      pushPoint(Date.now(), airT, soil);
    }
  } catch (e) {
    // keep silent or console
    console.log(e.message);
  }
}

window.addEventListener("load", () => {
  initCharts();
  updateUI();
  setInterval(updateUI, 2000); // refresh كل 2 ثواني
});
