// ===== EMQX CONFIG =====
const MQTT_HOST  = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER  = "sara";
const MQTT_PASS  = "12345678";

// ✅ نفس التوبيك اللي باين ف EMQX Online Test
const MQTT_TOPIC = "smart/irrigation";

// ===== UI =====
const dot = document.getElementById("dot");
const statusTxt = document.getElementById("statusTxt");

const airT = document.getElementById("airT");
const airRH = document.getElementById("airRH");
const soil = document.getElementById("soil");
const pumpBadge = document.getElementById("pumpBadge");

// ===== STATUS HELPERS =====
function setOnline(ok, msg) {
  dot.classList.remove("ok", "no");
  dot.classList.add(ok ? "ok" : "no");
  statusTxt.textContent = msg;
}

function setText(el, v, digits = null) {
  if (!el) return;
  if (v === undefined || v === null || v === "" || Number.isNaN(v)) {
    el.textContent = "--";
    return;
  }
  const n = Number(v);
  if (!Number.isNaN(n) && digits !== null) el.textContent = n.toFixed(digits);
  else el.textContent = String(v);
}

// ===== CHARTS =====
const tempChart = new Chart(document.getElementById("tempChart"), {
  type: "line",
  data: { labels: [], datasets: [{ label: "Temperature °C", data: [], tension: 0.3 }] },
  options: { responsive: true, animation: false, plugins: { legend: { display: true } } }
});

const soilChart = new Chart(document.getElementById("soilChart"), {
  type: "line",
  data: { labels: [], datasets: [{ label: "Soil", data: [], tension: 0.3 }] },
  options: { responsive: true, animation: false, plugins: { legend: { display: true } } }
});

const MAX_POINTS = 30;
function pushPoint(chart, value) {
  const t = new Date().toLocaleTimeString();
  chart.data.labels.push(t);
  chart.data.datasets[0].data.push(value);

  while (chart.data.labels.length > MAX_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

// ===== MQTT CONNECT =====
setOnline(false, "Connecting...");

const client = mqtt.connect(MQTT_HOST, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: "dash_" + Math.random().toString(16).slice(2),
  clean: true,
  connectTimeout: 5000,
  reconnectPeriod: 2000
});

client.on("connect", () => {
  setOnline(true, "MQTT Connected");
  client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
    if (err) setOnline(false, "Subscribe error");
    else setOnline(true, "Subscribed: " + MQTT_TOPIC);
  });
});

client.on("error", (err) => {
  console.error("MQTT error:", err);
  setOnline(false, "MQTT Error");
});

client.on("reconnect", () => setOnline(false, "Reconnecting..."));
client.on("close", () => setOnline(false, "Disconnected"));

// ===== MESSAGE HANDLER =====
client.on("message", (topic, message) => {
  if (topic !== MQTT_TOPIC) return;

  let d;
  try {
    d = JSON.parse(message.toString());
  } catch (e) {
    console.error("JSON parse error:", e, message.toString());
    return;
  }

  // ✅ Key mapping (باش يخدم مع أي نسخة ديال ESP32)
  // نسخة الصورة (Online Test): air_temp / air_rh / soil_pct / pump
  // نسخة أخرى: temperature / humidity / soil_adc / pump
  const T  = d.air_temp ?? d.temperature ?? d.temp ?? null;
  const RH = d.air_rh   ?? d.humidity    ?? d.rh   ?? null;
  const SO = d.soil_pct ?? d.soil        ?? d.soil_adc ?? null;
  const P  = d.pump ?? "OFF";

  setText(airT, T, 1);
  setText(airRH, RH, 1);
  setText(soil, SO, (d.soil_adc !== undefined ? null : 1)); // adc نخليه raw

  // Pump badge
  const on = String(P).toUpperCase() === "ON";
  pumpBadge.textContent = on ? "ON" : "OFF";
  pumpBadge.classList.toggle("on", on);
  pumpBadge.classList.toggle("off", !on);

  // Charts (غير إلا كانت أرقام)
  const tNum = Number(T);
  if (!Number.isNaN(tNum)) pushPoint(tempChart, tNum);

  const sNum = Number(SO);
  if (!Number.isNaN(sNum)) pushPoint(soilChart, sNum);

  // Debug (مهم)
  console.log("MQTT data:", d);
});
