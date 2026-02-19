/***********************
 * app.js — Smart Irrigation Dashboard (MQTT)
 * Works with ESP32 payload keys like:
 * air_temp, air_rh, soil_pct, pump, ts ...
 ***********************/

// ===== EMQX CONFIG =====
const MQTT_HOST  = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER  = "sara";
const MQTT_PASS  = "12345678";

// ✅ نفس التوبيك اللي باين فـ EMQX Online Test
const MQTT_TOPIC = "smart/irrigation";

// ===== UI =====
const el = (id) => document.getElementById(id);

function setOnline(ok, msg) {
  const dot = el("dot");
  if (dot) {
    dot.classList.remove("ok", "no");
    dot.classList.add(ok ? "ok" : "no");
  }
  if (el("statusTxt")) el("statusTxt").textContent = msg;
}

function setPumpBadge(state) {
  const badge = el("pumpBadge");
  if (!badge) return;
  const on = String(state).toUpperCase() === "ON";
  badge.textContent = on ? "ON" : "OFF";
  badge.classList.toggle("on", on);
  badge.classList.toggle("off", !on);
}

// ===== Charts =====
let tempChart, soilChart;
const maxPoints = 30;
const series = {
  labels: [],
  temp: [],
  soil: []
};

function pushPoint(label, t, s) {
  series.labels.push(label);
  series.temp.push(t);
  series.soil.push(s);

  while (series.labels.length > maxPoints) {
    series.labels.shift();
    series.temp.shift();
    series.soil.shift();
  }
}

function initCharts() {
  const tctx = el("tempChart")?.getContext("2d");
  const sctx = el("soilChart")?.getContext("2d");
  if (!tctx || !sctx || !window.Chart) return;

  tempChart = new Chart(tctx, {
    type: "line",
    data: {
      labels: series.labels,
      datasets: [{ label: "Temperature °C", data: series.temp, tension: 0.3 }]
    },
    options: { responsive: true, animation: false, plugins: { legend: { display: true } } }
  });

  soilChart = new Chart(sctx, {
    type: "line",
    data: {
      labels: series.labels,
      datasets: [{ label: "Soil (%)", data: series.soil, tension: 0.3 }]
    },
    options: { responsive: true, animation: false, plugins: { legend: { display: true } } }
  });
}

// ===== MQTT Connect =====
setOnline(false, "Connecting...");

const client = mqtt.connect(MQTT_HOST, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: "dashboard_" + Math.random().toString(16).slice(2),
  clean: true,
  connectTimeout: 5000,
  reconnectPeriod: 3000,
  // sometimes helps with some brokers:
  protocolVersion: 4
});

client.on("connect", () => {
  setOnline(true, "MQTT Connected ✅");
  console.log("[MQTT] connected");

  // ✅ subscribe على التوبيك الصحيح
  client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
    if (err) console.error("[MQTT] subscribe error:", err);
    else console.log("[MQTT] subscribed:", MQTT_TOPIC);
  });

  // (اختياري) إلا كان شي sub-topic
  client.subscribe(MQTT_TOPIC + "/#", { qos: 0 }, () => {});
});

client.on("reconnect", () => {
  setOnline(false, "Reconnecting...");
});

client.on("error", (err) => {
  console.error("[MQTT] error:", err);
  setOnline(false, "MQTT Error");
});

client.on("close", () => {
  setOnline(false, "Disconnected");
});

client.on("message", (topic, message) => {
  const txt = message.toString();
  console.log("[MQTT] msg topic=", topic, "payload=", txt);

  let d;
  try {
    d = JSON.parse(txt);
  } catch (e) {
    console.error("JSON parse error:", e);
    return;
  }

  // ✅ keys اللي كيرسل ESP32 فالصورة: air_temp, air_rh, soil_pct, pump
  const airT  = d.air_temp ?? d.temperature ?? null;
  const airRH = d.air_rh   ?? d.humidity    ?? null;
  const soil  = d.soil_pct ?? d.soil_adc    ?? d.soil ?? null;
  const pump  = d.pump ?? "OFF";

  if (el("airT"))  el("airT").textContent  = (airT  === null || Number.isNaN(Number(airT)))  ? "--" : Number(airT).toFixed(1);
  if (el("airRH")) el("airRH").textContent = (airRH === null || Number.isNaN(Number(airRH))) ? "--" : Number(airRH).toFixed(1);
  if (el("soil"))  el("soil").textContent  = (soil  === null || Number.isNaN(Number(soil)))  ? "--" : String(soil);

  setPumpBadge(pump);

  // charts
  if (!tempChart || !soilChart) initCharts();

  const label = new Date().toLocaleTimeString();
  if (tempChart && soilChart) {
    const tVal = (airT === null || Number.isNaN(Number(airT))) ? null : Number(airT);
    const sVal = (soil === null || Number.isNaN(Number(soil))) ? null : Number(soil);

    pushPoint(label, tVal, sVal);

    tempChart.update();
    soilChart.update();
  }
});
