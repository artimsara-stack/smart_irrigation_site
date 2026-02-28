/* =========================================================
   Smart Irrigation Dashboard — MQTT (EMQX)
   + Crop selection command -> smart/irrigation/cmd
   + Rain card (state + duration + lock + AO)
   ========================================================= */

// ===================== MQTT CONFIG =====================
const MQTT_HOST     = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER     = "sara";
const MQTT_PASS     = "12345678";
const MQTT_TOPIC    = "smart/irrigation";        // ESP32 publish
const MQTT_CMD_TOPIC= "smart/irrigation/cmd";    // dashboard -> ESP32 command

// ===================== DOM HELPERS =====================
const $ = (id) => document.getElementById(id);

function setText(id, v){
  const n = $(id);
  if (!n) return;
  n.textContent = (v === undefined || v === null || v === "") ? "--" : String(v);
}

function fmt(v, n=1){
  const x = Number(v);
  if (v === null || v === undefined || Number.isNaN(x)) return "--";
  return x.toFixed(n);
}

function setOnline(ok, msg){
  const dot = $("dot");
  if (dot){
    dot.classList.remove("ok","no");
    dot.classList.add(ok ? "ok" : "no");
  }
  setText("statusTxt", msg);
}

function setPumpBadge(state){
  const b = $("pumpBadge");
  if (!b) return;
  const isOn = String(state || "").toUpperCase() === "ON";
  b.textContent = isOn ? "ON" : "OFF";
  b.classList.toggle("on", isOn);
  b.classList.toggle("off", !isOn);
}

// ===================== SAFE JSON PARSE =====================
// Fix invalid JSON like: "lux":nan  -> "lux":null
function safeParse(raw){
  if (typeof raw !== "string") return null;

  const cleaned = raw
    .replace(/:\s*nan/gi, ":null")
    .replace(/:\s*NaN/g, ":null")
    .replace(/:\s*Infinity/g, ":null")
    .replace(/:\s*-Infinity/g, ":null");

  try {
    return JSON.parse(cleaned);
  } catch(e){
    console.log("❌ JSON parse failed");
    console.log("RAW    =", raw);
    console.log("CLEANED=", cleaned);
    console.log(e);
    return null;
  }
}

// ===================== CHARTS =====================
const MAX_POINTS = 40;
const charts = {};

function addPoint(obj, label, value){
  obj.labels.push(label);
  obj.data.push(value);

  while(obj.labels.length > MAX_POINTS){
    obj.labels.shift();
    obj.data.shift();
  }
  obj.chart.update();
}

function makeLineChart(canvasId, label){
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;

  const labels = [];
  const data = [];

  const chart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data,
        tension: 0.25,
        pointRadius: 2,
        pointHoverRadius: 3,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: true },
        tooltip: { intersect: false, mode: "index" }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: false }
      }
    }
  });

  return { chart, labels, data };
}

function initCharts(){
  charts.temp  = makeLineChart("cTemp",  "Air Temperature (°C)");
  charts.soil  = makeLineChart("cSoil",  "Soil (%)");
  charts.wind  = makeLineChart("cWind",  "Wind (km/h)");
  charts.press = makeLineChart("cPress", "Pressure (hPa)");
  charts.edi   = makeLineChart("cEdi",   "ET0 rate (mm/h)");
  charts.ppfd  = makeLineChart("cPpfd",  "PPFD");
}

function updateChart(ref, label, v){
  if (!ref) return;
  const x = Number(v);
  if (v === null || v === undefined || Number.isNaN(x)) return;
  addPoint(ref, label, x);
}

function clearCharts(){
  Object.values(charts).forEach(ref => {
    if (!ref) return;
    ref.labels.length = 0;
    ref.data.length = 0;
    ref.chart.update();
  });
}

// ===================== THEME + CLEAR =====================
function toggleTheme(){
  const root = document.documentElement;
  const cur = root.getAttribute("data-theme");
  root.setAttribute("data-theme", cur === "light" ? "dark" : "light");
}

function hookButtons(){
  const themeBtn = $("themeBtn");
  const clearBtn = $("clearBtn");

  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

  if (clearBtn) clearBtn.addEventListener("click", () => {
    msgCount = 0;
    setText("msgCount", msgCount);
    clearCharts();
  });
}

// ===================== CROP SELECTION (COMMAND) =====================
function hookCropSelect(){
  const sel = $("cropSelect");
  if (!sel) return;

  sel.addEventListener("change", () => {
    const crop = sel.value; // "TOMATO" or "BERRIES"
    if (!client || !client.connected) return;

    const payload = JSON.stringify({ crop });
    client.publish(MQTT_CMD_TOPIC, payload, { qos: 0, retain: true }, (err) => {
      if (err) console.log("❌ publish cmd error:", err);
      else console.log("✅ crop cmd sent:", payload);
    });
  });
}

function syncCropSelectFromESP(cropText){
  const sel = $("cropSelect");
  if (!sel) return;
  const up = String(cropText || "").toUpperCase();
  if (up.includes("BERR")) sel.value = "BERRIES";
  else if (up.includes("TOM")) sel.value = "TOMATO";
}

// ===================== MQTT CONNECT =====================
setOnline(false, "Connecting...");

let msgCount = 0;

const client = mqtt.connect(MQTT_HOST, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: "dash_" + Math.random().toString(16).slice(2),
  clean: true,
  connectTimeout: 8000,
  reconnectPeriod: 2500,
});

// ===================== BOOT =====================
window.addEventListener("load", () => {
  if (!document.documentElement.getAttribute("data-theme")){
    document.documentElement.setAttribute("data-theme", "dark");
  }
  initCharts();
  hookButtons();
  hookCropSelect();
});

client.on("connect", () => {
  setOnline(true, "MQTT Connected ✅");

  setText("topicLbl", MQTT_TOPIC);
  setText("msgCount", msgCount);

  client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
    if (err) setOnline(false, "Subscribe error ❌");
  });

  // optional wildcard
  client.subscribe(MQTT_TOPIC + "/#", { qos: 0 }, () => {});
});

client.on("reconnect", () => setOnline(false, "Reconnecting..."));
client.on("close", () => setOnline(false, "Disconnected"));
client.on("error", (e) => {
  console.log("MQTT error:", e);
  setOnline(false, "MQTT Error");
});

// ===================== MESSAGE HANDLER =====================
client.on("message", (topic, message) => {
  const raw = message.toString();
  console.log("📩 TOPIC:", topic);
  console.log("📩 RAW:", raw);

  const d = safeParse(raw);
  if (!d) return;

  msgCount++;
  setText("msgCount", msgCount);
  setText("topicLbl", topic);

  // ====== Fields from ESP32 ======
  const crop     = d.crop;
  const airT     = d.air_temp;
  const airRH    = d.air_rh;
  const soilPct  = d.soil_pct;

  const lux      = d.lux;
  const ppfd     = d.ppfd;

  const pressHpa = d.pressure_hpa;

  // wind in km/h (preferred) + fallback to ms*3.6
  const windKmh  = (d.wind_kmh !== undefined && d.wind_kmh !== null) ? d.wind_kmh : (
    (d.wind_ms !== undefined && d.wind_ms !== null) ? (Number(d.wind_ms) * 3.6) : null
  );

  const vpdKpa   = d.vpd;
  const et0Rate  = d.et0_rate_mm_h;
  const et0Daily = d.et0_daily_est_mm;

  const pump     = d.pump ?? "OFF";
  const isDay    = d.is_day;

  // rain
  const isRaining   = d.is_raining;         // 0/1
  const rainAO      = d.rain_ao;            // ADC
  const rainLockMin = d.rain_lock_min;      // minutes
  const rainDurMin  = d.rain_duration_min;  // ✅ from ESP

  // ====== KPIs ======
  setText("airT",  fmt(airT, 1));
  setText("airRH", fmt(airRH, 1));

  setText("soil", fmt(soilPct, 1));
  setText("soilUnit", "%");
  setText("soilSub", "Not controlling");

  // Light
  const ppfdNum = Number(ppfd);
  setText("ppfd", (ppfd === null || ppfd === undefined || Number.isNaN(ppfdNum) || ppfdNum < 0) ? "--" : fmt(ppfdNum, 2));

  const luxNum = Number(lux);
  setText("lux",  (lux === null || lux === undefined || Number.isNaN(luxNum) || luxNum < 0) ? "--" : Math.round(luxNum));

  // Wind / Pressure / VPD
  setText("wind",  fmt(windKmh, 1));
  setText("press", fmt(pressHpa, 1));
  setText("vpd",   fmt(vpdKpa, 2));

  // ET0
  setText("edi", fmt(et0Rate, 3));
  setText("ediSub", `daily≈ ${fmt(et0Daily, 2)} mm/d`);

  // Pump
  setPumpBadge(pump);
  setText("dayNight", (isDay === 1 || isDay === "1") ? "DAY ☀️" : "NIGHT 🌙");

  // Crop label + sync select
  setText("cropLbl", crop || "--");
  if (crop) syncCropSelectFromESP(crop);

  // Last update
  setText("timeLbl", "Last update: " + new Date().toLocaleTimeString());

  // ===== Rain Card =====
  const raining = (isRaining === 1 || isRaining === "1" || isRaining === true);
  setText("rainState", raining ? "RAIN" : "NO RAIN");
  setText("rainUnit",  raining ? "🌧️" : "☀️");

  let sub = `AO: ${rainAO ?? "--"}`;
  const dur = Number(rainDurMin);
  if (raining) {
    sub += ` • Duration: ${(!Number.isNaN(dur) ? dur : "--")} min`;
  } else {
    // show last known duration if provided
    if (!Number.isNaN(dur) && dur > 0) sub += ` • Last: ${dur} min`;
    const lock = Number(rainLockMin);
    sub += ` • Lock: ${(!Number.isNaN(lock) ? lock : "--")} min`;
  }
  setText("rainSub", sub);

  // ====== Charts ======
  const tLabel = new Date().toLocaleTimeString();
  updateChart(charts.temp,  tLabel, airT);
  updateChart(charts.soil,  tLabel, soilPct);
  updateChart(charts.wind,  tLabel, windKmh);
  updateChart(charts.press, tLabel, pressHpa);
  updateChart(charts.edi,   tLabel, et0Rate);
  updateChart(charts.ppfd,  tLabel, (ppfdNum < 0 ? null : ppfdNum));
});
