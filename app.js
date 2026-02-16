// ===== EMQX CONFIG =====
const MQTT_HOST = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER = "irrigation";      // بدلها
const MQTT_PASS = "12345678";        // بدلها
const MQTT_TOPIC = "smart/irrigation";  // نفس التوبيك لي كيستعمل ESP32

// ===== UI ELEMENTS =====
const el = {
  connDot: document.getElementById("connDot"),
  connText: document.getElementById("connText"),
  airTemp: document.getElementById("airTemp"),
  airRH: document.getElementById("airRH"),
  soil: document.getElementById("soil"),
  lux: document.getElementById("lux"),
  ppfd: document.getElementById("ppfd"),
  pumpPeriod: document.getElementById("pumpPeriod"),
  lastUpdate: document.getElementById("lastUpdate"),
};

// ===== Helpers =====
function setText(node, value) {
  if (!node) return;
  node.textContent =
    value === undefined || value === null || value === "" ? "--" : String(value);
}

function fmtNumber(v, digits = 1) {
  if (typeof v !== "number" || Number.isNaN(v)) return "--";
  return v.toFixed(digits);
}

function setConnected(ok, msg) {
  if (el.connDot) el.connDot.style.background = ok ? "#22c55e" : "#ef4444";
  setText(el.connText, msg);
}

// ===== Charts =====
let tempChart = null;
let soilChart = null;
const tempSeries = { labels: [], values: [] };
const soilSeries = { labels: [], values: [] };

function pushPoint(series, label, value, maxPoints = 30) {
  series.labels.push(label);
  series.values.push(value);
  while (series.labels.length > maxPoints) {
    series.labels.shift();
    series.values.shift();
  }
}

function ensureCharts() {
  if (!window.Chart) return;

  if (!tempChart) {
    const ctx = document.getElementById("tempChart")?.getContext("2d");
    if (ctx) {
      tempChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: tempSeries.labels,
          datasets: [{ label: "Air Temp (°C)", data: tempSeries.values, tension: 0.3 }],
        },
        options: { responsive: true, animation: false },
      });
    }
  }

  if (!soilChart) {
    const ctx = document.getElementById("soilChart")?.getContext("2d");
    if (ctx) {
      soilChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: soilSeries.labels,
          datasets: [{ label: "Soil (%)", data: soilSeries.values, tension: 0.3 }],
        },
        options: { responsive: true, animation: false },
      });
    }
  }
}

// ===== MQTT CONNECT =====
setConnected(false, "Connexion MQTT...");

const client = mqtt.connect(MQTT_HOST, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: "dashboard_" + Math.random().toString(16).substr(2, 8),
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 3000,
});

client.on("connect", () => {
  setConnected(true, "EMQX Connected ✅");
  client.subscribe(MQTT_TOPIC);
});

client.on("error", (err) => {
  console.error("MQTT Error:", err);
  setConnected(false, "Connexion error");
});

client.on("message", (topic, message) => {
  try {
    const d = JSON.parse(message.toString());

    const air_temp = d.air_temp;
    const air_rh = d.air_rh;
    const soil_pct = d.soil_pct;
    const lux = d.lux;
    const ppfd = d.ppfd;
    const pump = d.pump;
    const crop = d.crop;
    const irrig_ms = d.irrig_ms;

    // Update UI
    setText(el.airTemp, fmtNumber(air_temp, 1));
    setText(el.airRH, fmtNumber(air_rh, 1));
    setText(el.soil, fmtNumber(soil_pct, 1));
    setText(el.lux, typeof lux === "number" ? Math.round(lux) : "--");
    setText(el.ppfd, fmtNumber(ppfd, 2));

    let pumpLine = pump ?? "--";
    if (crop) pumpLine += ` • ${crop}`;
    if (typeof irrig_ms === "number") pumpLine += ` • ${irrig_ms}ms`;
    setText(el.pumpPeriod, pumpLine);

    setText(el.lastUpdate, new Date().toLocaleString());

    ensureCharts();
    const label = new Date().toLocaleTimeString();

    if (typeof air_temp === "number") {
      pushPoint(tempSeries, label, air_temp);
      tempChart?.update();
    }

    if (typeof soil_pct === "number") {
      pushPoint(soilSeries, label, soil_pct);
      soilChart?.update();
    }

  } catch (e) {
    console.error("JSON parse error:", e);
  }
});
