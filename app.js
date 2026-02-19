/* =========================================================
   SMART IRRIGATION — DASHBOARD (MQTT + CHARTS)
   Works with ESP32 publishing JSON on topic: smart/irrigation
   Requires: mqtt.min.js + chart.js loaded in HTML
========================================================= */

// ===================== MQTT CONFIG =====================
const MQTT_HOST  = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER  = "sara";
const MQTT_PASS  = "12345678";
const MQTT_TOPIC = "smart/irrigation"; // EXACT topic (no /# here)

// ===================== HELPERS =====================
const el = (id) => document.getElementById(id);

function setOnline(ok, msg){
  const dot = el("dot");
  const txt = el("statusTxt");
  if (dot){
    dot.classList.remove("ok","no");
    dot.classList.add(ok ? "ok" : "no");
  }
  if (txt) txt.textContent = msg;
}

function fmt(v, n=1){
  const x = Number(v);
  if (v === null || v === undefined || Number.isNaN(x)) return "--";
  return x.toFixed(n);
}

function setText(id, value){
  const node = el(id);
  if (!node) return;
  node.textContent = value;
}

function setPumpBadge(state){
  const b = el("pumpBadge");
  if (!b) return;
  const isOn = String(state).toUpperCase() === "ON";
  b.textContent = isOn ? "ON" : "OFF";
  b.classList.toggle("on", isOn);
  b.classList.toggle("off", !isOn);
}

// ===================== CHARTS =====================
const maxPoints = 40;
const charts = {}; // {key: Chart}

function makeLineChart(canvasId, label){
  const c = document.getElementById(canvasId);
  if (!c) return null;

  const ctx = c.getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        tension: 0.25,
        pointRadius: 2,
        borderWidth: 2,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: true }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: false }
      }
    }
  });
}

function pushPoint(chart, label, value){
  if (!chart) return;
  const v = Number(value);
  if (Number.isNaN(v)) return;

  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(v);

  while(chart.data.labels.length > maxPoints){
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

// Create charts AFTER page load
window.addEventListener("load", () => {
  // ⚠️ هنا حطّ IDs ديال canvas اللي عندك فـ HTML (إلا مختلفين بدّلهم غير هنا)
  charts.temp   = makeLineChart("tempChart",   "Air Temperature (°C)");
  charts.soil   = makeLineChart("soilChart",   "Soil (% / ADC)");
  charts.wind   = makeLineChart("windChart",   "Wind (m/s)");
  charts.press  = makeLineChart("pressChart",  "Pressure (hPa)");
  charts.ppfd   = makeLineChart("ppfdChart",   "PPFD");
  charts.edi    = makeLineChart("ediChart",    "EDI / ET0");

  // small UI init
  setText("topicTxt", MQTT_TOPIC);
  setText("msgCount", "0");
  setOnline(false, "Connecting...");
});

// ===================== MQTT CONNECT =====================
const client = mqtt.connect(MQTT_HOST, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: "dash_" + Math.random().toString(16).slice(2),
  clean: true,
  connectTimeout: 8000,
  reconnectPeriod: 2000
});

let msgCounter = 0;

client.on("connect", () => {
  setOnline(true, "MQTT Connected ✅");

  // Subscribe exact topic (no wildcard here)
  client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
    if (err) {
      console.log("Subscribe error:", err);
      setOnline(false, "Subscribe error ❌");
    } else {
      console.log("Subscribed to:", MQTT_TOPIC);
    }
  });
});

client.on("reconnect", () => setOnline(false, "Reconnecting..."));
client.on("close",     () => setOnline(false, "Disconnected"));
client.on("error", (e) => {
  console.log("MQTT error:", e);
  setOnline(false, "MQTT Error");
});

client.on("message", (topic, message) => {
  // 1) Verify topic + raw payload
  const raw = message.toString();
  console.log("[MQTT] topic:", topic);
  console.log("[MQTT] raw:", raw);

  // 2) Update counters
  msgCounter++;
  setText("msgCount", String(msgCounter));
  setText("topicTxt", topic);

  // 3) Parse JSON
  let d;
  try {
    d = JSON.parse(raw);
  } catch (e) {
    console.log("JSON parse error:", e);
    return;
  }

  // 4) Map fields (حسب payload ديال ESP32 اللي ورّيتي فـ EMQX)
  const airT   = d.air_temp ?? d.temperature;
  const airRH  = d.air_rh   ?? d.humidity;

  const soilPct = d.soil_pct;               // فـ نسخة ET0
  const soilADC = d.soil_adc ?? d.soilADC;  // فـ نسخة MQTT البسيطة
  const lux    = d.lux;
  const ppfd   = d.ppfd;

  const wind   = d.wind_ms;
  const press  = d.pressure_hpa;
  const vpd    = d.vpd;

  // “EDI/ET0” => نستعمل ET0 rate أو daily est (حسب شنو كترسل)
  const et0rate = d.et0_rate_mm_h;
  const et0day  = d.et0_daily_est_mm;

  const pump    = d.pump ?? "OFF";

  // 5) Fill KPIs (هاد IDs خاصهم يكونو فـ HTML)
  // إذا شي ID ما كاينش، ما كيوقع حتى error
  setText("airT", fmt(airT, 1));
  setText("airRH", fmt(airRH, 1));

  // Soil card: فضّل % وإذا ما كاينش هز ADC
  if (soilPct !== undefined && soilPct !== null) {
    setText("soil", fmt(soilPct, 1));
  } else if (soilADC !== undefined && soilADC !== null) {
    setText("soil", String(Math.round(Number(soilADC))));
  } else {
    setText("soil", "--");
  }

  setText("lux", fmt(lux, 0));
  setText("ppfd", fmt(ppfd, 2));

  setText("wind", fmt(wind, 2));
  setText("press", fmt(press, 1));
  setText("vpd", fmt(vpd, 2));

  // EDI/ET0 display
  if (et0rate !== undefined && et0rate !== null && !Number.isNaN(Number(et0rate))) {
    setText("edi", fmt(et0rate, 3));      // ET0 rate
  } else {
    setText("edi", fmt(et0day, 2));       // fallback daily
  }

  setPumpBadge(pump);

  // last update
  setText("lastUpdate", new Date().toLocaleTimeString());

  // 6) Push to charts
  const tLabel = new Date().toLocaleTimeString();

  pushPoint(charts.temp,  tLabel, airT);

  // soil chart: إذا % موجودة ديرها، إلا لا دير ADC
  if (soilPct !== undefined && soilPct !== null) {
    pushPoint(charts.soil, tLabel, soilPct);
  } else {
    pushPoint(charts.soil, tLabel, soilADC);
  }

  pushPoint(charts.wind,  tLabel, wind);
  pushPoint(charts.press, tLabel, press);
  pushPoint(charts.ppfd,  tLabel, ppfd);

  // edi chart: نفس logic
  if (et0rate !== undefined && et0rate !== null) {
    pushPoint(charts.edi, tLabel, et0rate);
  } else {
    pushPoint(charts.edi, tLabel, et0day);
  }
});
