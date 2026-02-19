/* =========================================================
   Smart Irrigation Dashboard — MQTT (EMQX)
   Works with your HTML IDs:
   KPIs: airT airRH soil soilUnit soilSub ppfd lux wind press vpd edi ediSub
        pumpBadge dayNight topicLbl msgCount timeLbl dot statusTxt
   Charts canvases: cTemp cSoil cWind cPress cEdi cPpfd
   Buttons: themeBtn clearBtn
   ========================================================= */

// ===================== MQTT CONFIG =====================
const MQTT_HOST  = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER  = "sara";
const MQTT_PASS  = "12345678";
const MQTT_TOPIC = "smart/irrigation"; // نفس اللي ف ESP32

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
const charts = {}; // { key: { chart, labels, data } }

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
  // canvases IDs from your HTML
  charts.temp  = makeLineChart("cTemp",  "Air Temperature (°C)");
  charts.soil  = makeLineChart("cSoil",  "Soil (%) / ADC");
  charts.wind  = makeLineChart("cWind",  "Wind (m/s)");
  charts.press = makeLineChart("cPress", "Pressure (hPa)");
  charts.edi   = makeLineChart("cEdi",   "EDI / ET0");
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

client.on("connect", () => {
  setOnline(true, "MQTT Connected ✅");

  // show topic + msg count in UI
  setText("topicLbl", MQTT_TOPIC);
  setText("msgCount", msgCount);

  // subscribe exact + wildcard
  client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
    if (err) setOnline(false, "Subscribe error ❌");
  });
  client.subscribe(MQTT_TOPIC + "/#", { qos: 0 }, () => {});
});

client.on("reconnect", () => setOnline(false, "Reconnecting..."));
client.on("close", () => setOnline(false, "Disconnected"));
client.on("error", (e) => {
  console.log("MQTT error:", e);
  setOnline(false, "MQTT Error");
});

// ===================== BOOT =====================
window.addEventListener("load", () => {
  // default theme
  if (!document.documentElement.getAttribute("data-theme")){
    document.documentElement.setAttribute("data-theme", "dark");
  }
  initCharts();
  hookButtons();
});

// ===================== MESSAGE HANDLER =====================
client.on("message", (topic, message) => {
  const raw = message.toString();

  // Debug (إلا بغيتي تشوف واش كيوصل message فالبراوزر)
  // فتح Console: (Mac) Cmd+Option+I ثم Console
  console.log("📩 TOPIC:", topic);
  console.log("📩 RAW:", raw);

  const d = safeParse(raw);
  if (!d) return;

  msgCount++;
  setText("msgCount", msgCount);
  setText("topicLbl", topic);

  // ====== Fields from ESP32 (حسب اللي بان ف EMQX) ======
  const airT     = d.air_temp;
  const airRH    = d.air_rh;
  const soilPct  = d.soil_pct;
  const lux      = d.lux;
  const ppfd     = d.ppfd;
  const pressHpa = d.pressure_hpa;
  const windMs   = d.wind_ms;
  const vpdKpa   = d.vpd;
  const et0Rate  = d.et0_rate_mm_h;      // نستعملها ف EDI card
  const pump     = d.pump ?? "OFF";
  const isDay    = d.is_day;

  // ====== KPIs ======
  setText("airT",  fmt(airT, 1));
  setText("airRH", fmt(airRH, 1));

  // Soil card: % (monitor)
  setText("soil", fmt(soilPct, 1));
  setText("soilUnit", "%");
  setText("soilSub", "Not controlling");

  // Light
  setText("ppfd", fmt(ppfd, 2));
  setText("lux",  (lux === null || lux === undefined || Number.isNaN(Number(lux))) ? "--" : Math.round(Number(lux)));

  // Wind / Pressure / VPD
  setText("wind",  fmt(windMs, 2));
  setText("press", fmt(pressHpa, 1));
  setText("vpd",   fmt(vpdKpa, 2));

  // EDI/ET0 card: نخليها ET0_rate باش ما تبقاش خاوية
  setText("edi", fmt(et0Rate, 3));
  setText("ediSub", "index");

  // Pump
  setPumpBadge(pump);
  setText("dayNight", (isDay === 1 || isDay === "1") ? "DAY ☀️" : "NIGHT 🌙");

  // Last update
  setText("timeLbl", "Last update: " + new Date().toLocaleTimeString());

  // ====== Charts ======
  const tLabel = new Date().toLocaleTimeString();

  updateChart(charts.temp,  tLabel, airT);
  updateChart(charts.soil,  tLabel, soilPct);
  updateChart(charts.wind,  tLabel, windMs);
  updateChart(charts.press, tLabel, pressHpa);
  updateChart(charts.edi,   tLabel, et0Rate);
  updateChart(charts.ppfd,  tLabel, ppfd);
});
