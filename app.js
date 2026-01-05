/*************************************************
 *  Smart Irrigation Dashboard (Firebase RTDB)
 *  - Reads values from Realtime Database via REST
 *  - Updates KPI cards + 2 charts
 *************************************************/

// ✅ 1) PUT YOUR FIREBASE BASE URL HERE (NO .json at end)
const FIREBASE_BASE = "https://smart-irrigation-site-90e51-default-rtdb.firebaseio.com";

// ✅ 2) PATH WHERE YOUR DATA IS STORED
// From your screenshot, you have air_temp at root => "/"
const DATA_PATH = "/";           // root
// If later you store into "/latest", set: const DATA_PATH = "/latest";

const POLL_MS = 2000;

// ---------- DOM ----------
const el = (id) => document.getElementById(id);

const airTempEl = el("airTemp");
const airRHEl   = el("airRH");
const soilEl    = el("soil");
const luxEl     = el("lux");
const ppfdEl    = el("ppfd");
const pumpPerEl = el("pumpPeriod");

const connDot  = el("connDot");
const connText = el("connText");
const lastUpEl = el("lastUpdate");

// ---------- Charts ----------
const makeChart = (ctx, label) => new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label,
      data: [],
      tension: 0.25,
      pointRadius: 0,
      borderWidth: 2
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { ticks: { maxTicksLimit: 6 } },
      y: { beginAtZero: true }
    }
  }
});

const tempChart = makeChart(document.getElementById("tempChart"), "Air Temp (°C)");
const soilChart = makeChart(document.getElementById("soilChart"), "Soil (%)");

// Fix canvas height (so charts show well)
document.getElementById("tempChart").parentElement.style.height = "320px";
document.getElementById("soilChart").parentElement.style.height = "320px";

function setConn(ok, msg){
  connDot.classList.remove("ok","bad");
  connDot.classList.add(ok ? "ok" : "bad");
  connText.textContent = msg;
}

function fmt(v, digits=1){
  if (v === undefined || v === null || Number.isNaN(v)) return "--";
  return Number(v).toFixed(digits);
}

function pushPoint(chart, value){
  const now = new Date();
  const t = now.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"});

  chart.data.labels.push(t);
  chart.data.datasets[0].data.push(value);

  // keep last 30 points
  if (chart.data.labels.length > 30){
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

// ---------- Firebase REST fetch ----------
async function fetchData(){
  // Build URL: base + path + ".json"
  // Ensure no double slashes
  const base = FIREBASE_BASE.replace(/\/+$/,"");
  const path = DATA_PATH.startsWith("/") ? DATA_PATH : "/" + DATA_PATH;
  const url = `${base}${path}.json`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
}

function applyData(d){
  // d is object from RTDB
  // expected keys: air_temp, air_rh, soil, lux, ppfd, pump, period

  const tAir  = d?.air_temp;
  const rh    = d?.air_rh;
  const soil  = d?.soil;
  const lux   = d?.lux;
  const ppfd  = d?.ppfd;
  const pump  = d?.pump;
  const period= d?.period;

  airTempEl.textContent = (tAir==null) ? "--" : `${fmt(tAir,1)} °C`;
  airRHEl.textContent   = (rh==null)   ? "--" : `${fmt(rh,0)} %`;
  soilEl.textContent    = (soil==null) ? "--" : `${fmt(soil,0)} %`;
  luxEl.textContent     = (lux==null)  ? "--" : `${fmt(lux,0)}`;
  ppfdEl.textContent    = (ppfd==null) ? "--" : `${fmt(ppfd,1)}`;

  const pumpTxt = pump ? String(pump) : "--";
  const perTxt  = period ? String(period) : "--";
  pumpPerEl.textContent = `${pumpTxt} / ${perTxt}`;

  // charts
  if (tAir != null && !Number.isNaN(Number(tAir))) pushPoint(tempChart, Number(tAir));
  if (soil != null && !Number.isNaN(Number(soil))) pushPoint(soilChart, Number(soil));

  lastUpEl.textContent = new Date().toLocaleString();
}

async function loop(){
  try{
    const data = await fetchData();
    setConn(true, "Firebase OK");
    applyData(data || {});
  }catch(e){
    console.error(e);
    setConn(false, "Firebase ERROR");
  }
}

loop();
setInterval(loop, POLL_MS);
const DB_URL = "https://smart-irrigation-site-90e51-default-rtdb.firebaseio.com/last.json";

async function loadLast() {
  try {
    const r = await fetch(DB_URL);
    const d = await r.json();

    // بدلّي IDs هنا حسب HTML ديالك
    set("air_temp", d.air_temp);
    set("air_rh", d.air_rh);
    set("bmp_temp", d.bmp_temp);
    set("soil_pct", d.soil_pct);
    set("lux", d.lux);
    set("ppfd", d.ppfd);
    set("pressure_hpa", d.pressure_hpa);
    set("pump", d.pump);
    set("irrig_ms", d.irrig_ms);
    set("crop", d.crop);

    set("last_update", new Date().toLocaleString());
    set("status", "Connected ✅");
  } catch (e) {
    console.error(e);
    set("status", "Error ❌");
  }
}

function set(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = (v === undefined || v === null) ? "--" : v;
}

loadLast();
setInterval(loadLast, 2000);

