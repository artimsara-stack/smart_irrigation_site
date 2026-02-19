// ===================== MQTT CONFIG =====================
const MQTT_HOST  = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER  = "sara";
const MQTT_PASS  = "12345678";
const MQTT_TOPIC = "smart/irrigation"; // ✅ نفس اللي فـ ESP32

// ===================== UI HELPERS =====================
const el = (id) => document.getElementById(id);

function setOnline(ok, msg){
  const dot = el("dot");
  dot.classList.remove("ok","no");
  dot.classList.add(ok ? "ok" : "no");
  el("statusTxt").textContent = msg;
}

function fmt(v, n=1){
  const x = Number(v);
  if (v === null || v === undefined || Number.isNaN(x)) return "--";
  return x.toFixed(n);
}

function setPumpBadge(state){
  const b = el("pumpBadge");
  const isOn = String(state).toUpperCase() === "ON";
  b.textContent = isOn ? "ON" : "OFF";
  b.classList.toggle("on", isOn);
  b.classList.toggle("off", !isOn);
}

// ===================== CHARTS =====================
let tempChart, soilChart;
const maxPoints = 30;

function makeLineChart(canvasId, label){
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
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
}

function pushPoint(chart, label, value){
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(value);

  while(chart.data.labels.length > maxPoints){
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

window.addEventListener("load", () => {
  tempChart = makeLineChart("tempChart", "Air Temperature (°C)");
  soilChart = makeLineChart("soilChart", "Soil (ADC)");
});

// ===================== MQTT CONNECT =====================
setOnline(false, "Connecting...");

const client = mqtt.connect(MQTT_HOST, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: "dash_" + Math.random().toString(16).slice(2),
  clean: true,
  connectTimeout: 5000,
  reconnectPeriod: 2000,
});

client.on("connect", () => {
  setOnline(true, "MQTT Connected ✅");
  client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
    if (err) setOnline(false, "Subscribe error ❌");
  });
});

client.on("reconnect", () => setOnline(false, "Reconnecting..."));
client.on("close", () => setOnline(false, "Disconnected"));
client.on("error", (e) => {
  console.log("MQTT error:", e);
  setOnline(false, "MQTT Error");
});

client.on("message", (topic, message) => {
  try {
    // ✅ باش نعرفو واش topic صحيح
    // console.log("TOPIC:", topic);
    // console.log("RAW:", message.toString());

    const d = JSON.parse(message.toString());

    // ✅ مطابق للي كيرسل ESP32
    const airT = d.air_temp ?? d.temperature;   // fallback إلا كنتي كترسل temperature
    const airRH = d.air_rh ?? d.humidity;
    const soilADC = d.soil_adc ?? d.soilADC ?? d.soil_adc_raw; // فالكود MQTT البسيط كاين soil_adc
    const pump = d.pump ?? "OFF";

    el("airT").textContent = fmt(airT, 1);
    el("airRH").textContent = fmt(airRH, 1);

    // فـ نسخة ET0 كتبعث soil_pct، وفـ نسخة MQTT البسيطة كتبعث soil_adc
    // هنا غادي نعرض ADC إلا جا، وإلا نعرض soil_pct كحل بديل
    el("soil").textContent = (soilADC !== undefined && soilADC !== null)
      ? String(Math.round(Number(soilADC)))
      : fmt(d.soil_pct, 1);

    setPumpBadge(pump);

    // Charts
    const tLabel = new Date().toLocaleTimeString();
    if (airT !== undefined && airT !== null) pushPoint(tempChart, tLabel, Number(airT));
    if (soilADC !== undefined && soilADC !== null) pushPoint(soilChart, tLabel, Number(soilADC));

  } catch (e) {
    console.log("Parse error:", e);
  }
});
