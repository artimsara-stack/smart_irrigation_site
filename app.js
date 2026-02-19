/* =========================================================
   Smart Irrigation Dashboard — MQTT (EMQX)  ✅
   - Robust JSON parsing (fix nan/NaN => null)
   - Updates KPIs + Pump badge + Message counter + Topic label
   - Auto-creates charts if canvases exist
   ========================================================= */

// ===================== MQTT CONFIG =====================
const MQTT_HOST  = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER  = "sara";
const MQTT_PASS  = "12345678";

// نفس اللي فـ ESP32
const MQTT_TOPIC = "smart/irrigation";

// ===================== DOM HELPERS =====================
const $ = (id) => document.getElementById(id);

function setText(id, v){
  const node = $(id);
  if (!node) return;
  node.textContent = (v === undefined || v === null || v === "") ? "--" : String(v);
}

function setOnline(ok, msg){
  const dot = $("dot");
  if (dot){
    dot.classList.remove("ok","no");
    dot.classList.add(ok ? "ok" : "no");
  }
  setText("statusTxt", msg);
}

function fmt(v, n=1){
  const x = Number(v);
  if (v === null || v === undefined || Number.isNaN(x)) return "--";
  return x.toFixed(n);
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
// EMQX كيبان فيه "lux":nan  => هذا INVALID JSON
// كنحوّلو nan/NaN/Infinity/-Infinity لـ null باش JSON.parse يخدم
function safeParse(raw){
  if (typeof raw !== "string") return null;

  // replace :nan  / :NaN / :Infinity / :-Infinity  => :null
  const cleaned = raw
    .replace(/:\s*nan/gi, ":null")
    .replace(/:\s*NaN/g, ":null")
    .replace(/:\s*Infinity/g, ":null")
    .replace(/:\s*-Infinity/g, ":null");

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.log("❌ JSON parse error. RAW=", raw);
    console.log("❌ JSON parse error. CLEANED=", cleaned);
    console.log(e);
    return null;
  }
}

// ===================== CHARTS (optional) =====================
const MAX_POINTS = 40;

function pushSeries(series, label, value){
  series.labels.push(label);
  series.values.push(value);
  while(series.labels.length > MAX_POINTS){
    series.labels.shift();
    series.values.shift();
  }
}

function makeChart(canvasId, label){
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;

  const ctx = canvas.getContext("2d");
  const series = { labels: [], values: [] };

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: series.labels,
      datasets: [{
        label,
        data: series.values,
        tension: 0.25,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: { legend: { display: true } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: false }
      }
    }
  });

  return { chart, series };
}

// خزّنا charts حسب IDs اللي كاينين فـ HTML ديالك (إلا ماكانوش كيتجاهل)
const charts = {};

// جرّب هاد الأسماء (خلي اللي عندك)
function initCharts(){
  charts.temp   = makeChart("tempChart",   "Air Temperature (°C)");
  charts.soil   = makeChart("soilChart",   "Soil (%) / ADC");
  charts.wind   = makeChart("windChart",   "Wind (m/s)");
  charts.press  = makeChart("pressChart",  "Pressure (hPa)");
  charts.ppfd   = makeChart("ppfdChart",   "PPFD");
  charts.vpd    = makeChart("vpdChart",    "VPD (kPa)");
  charts.et0    = makeChart("et0Chart",    "ET0 rate (mm/h)");
}

function updateChart(ref, label, value){
  if (!ref || value === null || value === undefined || Number.isNaN(Number(value))) return;
  pushSeries(ref.series, label, Number(value));
  ref.chart.update();
}

// ===================== MQTT CONNECT =====================
setOnline(false, "Connecting...");

let msgCount = 0;

const client = mqtt.connect(MQTT_HOST, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: "dash_" + Math.random().toString(16).slice(2),
  clean: true,
  connectTimeout: 7000,
  reconnectPeriod: 2500,
});

client.on("connect", () => {
  setOnline(true, "MQTT Connected ✅");

  // باش تعرفي واش كيوصلو messages: كنكتب topic فالكارت
  setText("mqttTopic", MQTT_TOPIC);
  setText("msgsCount", msgCount);

  // Subscribe للtopic + wildcard احتياطاً
  client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
    if (err) setOnline(false, "Subscribe error ❌");
  });
  client.subscribe(MQTT_TOPIC + "/#", { qos: 0 }, () => {}); // safe extra
});

client.on("reconnect", () => setOnline(false, "Reconnecting..."));
client.on("close", () => setOnline(false, "Disconnected"));
client.on("error", (e) => {
  console.log("MQTT error:", e);
  setOnline(false, "MQTT Error");
});

window.addEventListener("load", () => {
  initCharts();
});

// ===================== MESSAGE HANDLER =====================
client.on("message", (topic, message) => {
  const raw = message.toString();

  // Debug: خليه خدام حتى يبان لك واش كيوصلو messages
  // فتح DevTools Console وغادي تشوف هاد السطور
  console.log("📩 TOPIC:", topic);
  console.log("📩 RAW:", raw);

  const d = safeParse(raw);
  if (!d) return; // parse فشل

  msgCount++;
  setText("msgsCount", msgCount);
  setText("mqttTopic", topic);

  // ====== Fields (مطابقة للي كيبعث ESP32 ديالك) ======
  // من الصورة ديال EMQX كيبانو: air_temp, air_rh, soil_pct, lux, ppfd, pressure_hpa, wind_ms, vpd, et0_rate_mm_h, pump...
  const airT     = d.air_temp ?? d.temperature;
  const airRH    = d.air_rh ?? d.humidity;
  const soilPct  = d.soil_pct;
  const soilADC  = d.soil_adc ?? d.soilADC ?? d.soil_adc_raw; // إلا عندك نسخة ADC
  const lux      = d.lux;
  const ppfd     = d.ppfd;
  const pressHpa = d.pressure_hpa ?? d.pressure_hpa ?? d.pressure;
  const windMs   = d.wind_ms ?? d.wind;
  const vpdKpa   = d.vpd;
  const et0Rate  = d.et0_rate_mm_h;
  const et0Daily = d.et0_daily_est_mm;
  const pump     = d.pump ?? "OFF";

  // ====== Update KPIs (استعمل نفس IDs اللي فـ HTML ديالك) ======
  // إذا شي ID ما كاينش، setText كتتجاهلو بلا مشاكل
  setText("airT",  fmt(airT, 1));
  setText("airRH", fmt(airRH, 1));

  // Soil: إلا جا ADC كنوريه، إلا لا كنوري %
  if (soilADC !== undefined && soilADC !== null && !Number.isNaN(Number(soilADC))){
    setText("soil", Math.round(Number(soilADC)));
  } else {
    setText("soil", fmt(soilPct, 1));
  }

  setText("lux",   (lux === null || lux === undefined || Number.isNaN(Number(lux))) ? "--" : Math.round(Number(lux)));
  setText("ppfd",  fmt(ppfd, 2));
  setText("wind",  fmt(windMs, 2));
  setText("press", fmt(pressHpa, 1));
  setText("vpd",   fmt(vpdKpa, 2));

  // EDI/ETO: عندك فـ ESP32 ما كاينش edi، ولكن كاين et0_rate و et0_daily
  // نخلي "edi" يعرض ET0_rate باش ماتبانش خاوية
  setText("edi", fmt(et0Rate, 3));

  // Pump badge
  setPumpBadge(pump);
  setText("pumpTxt", String(pump).toUpperCase()); // إذا عندك هذا الID
  setText("pump", String(pump).toUpperCase());    // إذا عندك هذا الID

  // Last update
  setText("lastUpdate", new Date().toLocaleString());

  // ====== Charts (إذا كانو canvases موجودين) ======
  const tLabel = new Date().toLocaleTimeString();

  updateChart(charts.temp,  tLabel, airT);
  updateChart(charts.soil,  tLabel, (soilADC ?? soilPct));
  updateChart(charts.wind,  tLabel, windMs);
  updateChart(charts.press, tLabel, pressHpa);
  updateChart(charts.ppfd,  tLabel, ppfd);
  updateChart(charts.vpd,   tLabel, vpdKpa);
  updateChart(charts.et0,   tLabel, et0Rate);

  // Extra display if you have these IDs
  setText("et0Rate", fmt(et0Rate, 4));
  setText("et0Daily", fmt(et0Daily, 2));
});
