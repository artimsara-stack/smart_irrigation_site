// app.js — Smart Irrigation Dashboard (EMQX Cloud MQTT)
// ESP32 payload:
// {"temperature":..,"humidity":..,"soil_adc":..,"pump":"ON|OFF"}

const MQTT_URL   = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER  = "sara";
const MQTT_PASS  = "12345678";
const MQTT_TOPIC = "smart/irrigation";

const $ = (id) => document.getElementById(id);

// Status UI
function setOnline(ok, msg) {
  const dot = $("dot");
  dot.classList.remove("ok", "no");
  dot.classList.add(ok ? "ok" : "no");
  $("statusTxt").textContent = msg;
}

function fmt(x, n = 1) {
  if (x === null || x === undefined) return "--";
  const v = Number(x);
  if (Number.isNaN(v)) return "--";
  return v.toFixed(n);
}

function setPump(state) {
  const badge = $("pumpBadge");
  const txt = $("pumpTxt");
  const st = String(state || "").toUpperCase();

  if (st === "ON") {
    badge.classList.add("on");
    badge.classList.remove("off");
    txt.textContent = "PUMP ON";
  } else {
    badge.classList.add("off");
    badge.classList.remove("on");
    txt.textContent = "PUMP OFF";
  }
}

// Charts
function makeChart(canvasId, label) {
  return new Chart($(canvasId), {
    type: "line",
    data: { labels: [], datasets: [{ label, data: [] }] },
    options: {
      responsive: true,
      animation: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { maxTicksLimit: 10 } } }
    }
  });
}

const chTemp = makeChart("cTemp", "Temp");
const chHum  = makeChart("cHum",  "Humidity");
const chSoil = makeChart("cSoil", "Soil ADC");
const chPump = makeChart("cPump", "Pump");

const HIST_MAX = 30;
const hist = []; // {t,h,s,p}

function updateCharts() {
  const labels = hist.map((_, i) => String(i + 1));

  chTemp.data.labels = labels;
  chHum.data.labels  = labels;
  chSoil.data.labels = labels;
  chPump.data.labels = labels;

  chTemp.data.datasets[0].data = hist.map(x => x.t);
  chHum.data.datasets[0].data  = hist.map(x => x.h);
  chSoil.data.datasets[0].data = hist.map(x => x.s);
  chPump.data.datasets[0].data = hist.map(x => x.p);

  chTemp.update();
  chHum.update();
  chSoil.update();
  chPump.update();
}

// MQTT
let client = null;

function connectMQTT() {
  setOnline(false, "Connecting MQTT…");

  try { client?.end(true); } catch (_) {}

  client = mqtt.connect(MQTT_URL, {
    username: MQTT_USER,
    password: MQTT_PASS,
    clientId: "dash_" + Math.random().toString(16).slice(2),
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 8000
  });

  client.on("connect", () => {
    setOnline(true, "MQTT Connected");
    client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
      if (err) {
        console.log("Subscribe error:", err);
        setOnline(false, "Subscribe error");
      }
    });
  });

  client.on("message", (topic, message) => {
    if (topic !== MQTT_TOPIC) return;

    let d;
    try {
      d = JSON.parse(message.toString());
    } catch (e) {
      console.log("Bad JSON:", e, message.toString());
      return;
    }

    // Update KPIs (ESP32 keys)
    $("airT").textContent  = fmt(d.temperature, 1);
    $("airRH").textContent = fmt(d.humidity, 1);
    $("soil").textContent  = (d.soil_adc ?? "--");
    setPump(d.pump);

    $("timeLbl").textContent = "Last update: " + new Date().toLocaleTimeString();

    // Add to charts
    const t = Number(d.temperature);
    const h = Number(d.humidity);
    const s = Number(d.soil_adc);
    const p = (String(d.pump || "").toUpperCase() === "ON") ? 1 : 0;

    hist.push({
      t: Number.isFinite(t) ? t : null,
      h: Number.isFinite(h) ? h : null,
      s: Number.isFinite(s) ? s : null,
      p
    });

    while (hist.length > HIST_MAX) hist.shift();
    updateCharts();
  });

  client.on("reconnect", () => setOnline(false, "Reconnecting…"));
  client.on("close", () => setOnline(false, "Disconnected"));
  client.on("error", (err) => {
    console.log("MQTT error:", err);
    setOnline(false, "MQTT Error");
  });
}

$("reconnectBtn").addEventListener("click", connectMQTT);

// Start
connectMQTT();
 ⁠
