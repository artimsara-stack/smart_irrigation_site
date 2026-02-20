/* =========================================================
   Smart Irrigation Dashboard — MQTT (EMQX)

   ✅ 2 PILLS:
   - MQTT pill: mqttDot + mqttStatusTxt (connect/disconnect فقط)
   - LIVE pill: dot + statusTxt (data freshness + sensors completeness)

   ✅ NO_DATA_AFTER_MS = 15000 (15s)
   ✅ Safe JSON parse (nan/NaN => null)
   ✅ Charts: cTemp cSoil cWind cPress cEdi cPpfd
   ✅ Buttons: themeBtn clearBtn
   ========================================================= */

// ===================== MQTT CONFIG =====================
const MQTT_HOST  = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER  = "sara";
const MQTT_PASS  = "12345678";
const MQTT_TOPIC = "smart/irrigation";

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

function setDotState(dotId, state){ // state: "ok" | "no" | "warn"
  const dot = $(dotId);
  if (!dot) return;
  dot.classList.remove("ok","no","warn");
  dot.classList.add(state);
}

// ✅ LIVE / DATA pill
function setLivePill(state, msg){
  // state: ok/no/warn
  setDotState("dot", state);
  setText("statusTxt", msg);
}

// ✅ MQTT pill
function setMqttPill(connected){
  setDotState("mqttDot", connected ? "ok" : "no");
  setText("mqttStatusTxt", connected ? "MQTT Connected ✅" : "MQTT Disconnected ❌");
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
function safeParse(raw){
  if (typeof raw !== "string") return null;

  const cleaned = raw
    .replace(/:\s*nan/gi, ":null")
    .replace(/:\s*NaN/gi, ":null")
    .replace(/:\s*Infinity/gi, ":null")
    .replace(/:\s*-Infinity/gi, ":null");

  try {
    return JSON.parse(cleaned);
  } catch(e){
    console.log("❌ JSON parse failed", e);
    console.log("RAW    =", raw);
    console.log("CLEANED=", cleaned);
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
  const b = document.body;
  const cur = b.getAttribute("data-theme") || "dark";
  b.setAttribute("data-theme", cur === "light" ? "dark" : "light");
}

let msgCount = 0;
let lastMsgAt = 0;
let lastPayload = null;

function hookButtons(){
  const themeBtn = $("themeBtn");
  const clearBtn = $("clearBtn");

  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

  if (clearBtn) clearBtn.addEventListener("click", () => {
    msgCount = 0;
    lastMsgAt = 0;
    lastPayload = null;

    setText("msgCount", msgCount);
    setText("topicLbl", MQTT_TOPIC);
    setText("timeLbl", "Last update: --");

    // KPIs -> --
    setText("airT","--"); setText("airRH","--"); setText("soil","--");
    setText("ppfd","--"); setText("lux","--"); setText("wind","--");
    setText("press","--"); setText("vpd","--"); setText("edi","--");
    setText("soilSub","--"); setText("ediSub","index"); setText("dayNight","--");
    setPumpBadge("OFF");

    clearCharts();
    setLivePill("warn", "No data");
  });
}

// ===================== LIVE LOGIC =====================
const NO_DATA_AFTER_MS = 15000;

// واش الداتا “كاملة” = ESP شغال + السنسورات كتعطي قيم (مشي null)
function computeCompleteness(d){
  // اللي مهمين باش نقولو “LIVE” فالديمو ديالك
  const required = ["air_temp","air_rh","pressure_hpa","wind_ms","vpd"];
  let ok = 0;

  required.forEach(k => {
    const v = d?.[k];
    const num = Number(v);
    if (v !== null && v !== undefined && !Number.isNaN(num)) ok++;
  });

  return { ok, total: required.length };
}

function applyNoDataUI(stale=false){
  setLivePill("warn", stale ? "No data / Stale" : "No data / Device offline");
  setText("timeLbl", stale && lastMsgAt ? ("Last update: " + new Date(lastMsgAt).toLocaleTimeString() + " (stale)") : "Last update: --");
  setText("soilSub", "No data / Sensor disconnected");
  setText("ediSub", "No data");
}

// ===================== MQTT CONNECT =====================
// init pills
setLivePill("warn", "Connecting...");
setMqttPill(false);

const client = mqtt.connect(MQTT_HOST, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: "dash_" + Math.random().toString(16).slice(2),
  clean: true,
  connectTimeout: 8000,
  reconnectPeriod: 2500,
});

client.on("connect", () => {
  setMqttPill(true);

  setText("topicLbl", MQTT_TOPIC);
  setText("msgCount", msgCount);

  client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
    if (err) console.log("Subscribe error", err);
  });
  client.subscribe(MQTT_TOPIC + "/#", { qos: 0 }, () => {});
});

client.on("reconnect", () => setMqttPill(false));
client.on("close", () => setMqttPill(false));
client.on("error", () => setMqttPill(false));

// ===================== BOOT =====================
window.addEventListener("load", () => {
  if (!document.body.getAttribute("data-theme")){
    document.body.setAttribute("data-theme", "dark");
  }
  initCharts();
  hookButtons();
});

// ===================== MESSAGE HANDLER =====================
client.on("message", (topic, message) => {
  const raw = message.toString();
  const d = safeParse(raw);
  if (!d) return;

  lastMsgAt = Date.now();
  lastPayload = d;

  msgCount++;
  setText("msgCount", msgCount);
  setText("topicLbl", topic);

  // fields (حسب اللي عندك ف EMQX)
  const airT     = d.air_temp ?? d.temperature;
  const airRH    = d.air_rh ?? d.humidity;
  const soilPct  = d.soil_pct;
  const lux      = d.lux;
  const ppfd     = d.ppfd;
  const pressHpa = d.pressure_hpa;
  const windMs   = d.wind_ms;
  const vpdKpa   = d.vpd;
  const et0Rate  = d.et0_rate_mm_h ?? d.edi;
  const pump     = d.pump ?? "OFF";
  const isDay    = d.is_day;

  // KPIs
  setText("airT",  fmt(airT, 1));
  setText("airRH", fmt(airRH, 1));

  setText("soil", fmt(soilPct, 1));
  setText("soilUnit", "%");
  setText("soilSub", "Not controlling");

  setText("ppfd", fmt(ppfd, 2));
  setText("lux",  (lux === null || lux === undefined || Number.isNaN(Number(lux))) ? "--" : Math.round(Number(lux)));

  setText("wind",  fmt(windMs, 2));
  setText("press", fmt(pressHpa, 1));
  setText("vpd",   fmt(vpdKpa, 2));

  setText("edi", fmt(et0Rate, 3));
  setText("ediSub", "ET0 rate (mm/h)");

  setPumpBadge(pump);
  setText("dayNight", (isDay === 1 || isDay === "1") ? "DAY ☀️" : "NIGHT 🌙");

  setText("timeLbl", "Last update: " + new Date().toLocaleTimeString());

  // Charts
  const tLabel = new Date().toLocaleTimeString();
  updateChart(charts.temp,  tLabel, airT);
  updateChart(charts.soil,  tLabel, soilPct);
  updateChart(charts.wind,  tLabel, windMs);
  updateChart(charts.press, tLabel, pressHpa);
  updateChart(charts.edi,   tLabel, et0Rate);
  updateChart(charts.ppfd,  tLabel, ppfd);
});

// ===================== HEALTH CHECK LOOP (LIVE PILL) =====================
setInterval(() => {
  // ما كايناش حتى رسالة
  if (msgCount === 0){
    applyNoDataUI(false);
    return;
  }

  const dt = Date.now() - lastMsgAt;

  // ستالات الرسائل (ESP طافي ولا الشبكة/النشر وقف)
  if (dt > NO_DATA_AFTER_MS){
    applyNoDataUI(true);
    return;
  }

  // كاين رسائل حديثة: دابا نشوف واش السنسورات كيعطيو قيم مزيان
  const { ok, total } = computeCompleteness(lastPayload);

  if (ok === total){
    setLivePill("ok", "LIVE ✅");
  } else {
    setLivePill("warn", "LIVE (partial) ⚠️");
    // تقدر تبين السبب فـ sub (اختياري)
    setText("soilSub", "Sensor disconnected / partial");
  }

}, 1000);
