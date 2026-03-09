/* =========================================================
   Smart Irrigation Dashboard — MQTT + Firebase History
   Live: MQTT
   History: Firebase RTDB
   + Header Alerts Pill + Sound Alarm
   ========================================================= */

// ===================== MQTT CONFIG =====================
const MQTT_HOST      = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER      = "sara";
const MQTT_PASS      = "12345678";
const MQTT_TOPIC     = "smart/irrigation";
const MQTT_CMD_TOPIC = "smart/irrigation/cmd";

// ===================== DOM HELPERS =====================
const $ = (id) => document.getElementById(id);

const alertCard  = $("alertsCard");
const alertState = $("alertState");
const alertMsg   = $("alertMsg");
const alarm      = $("alarmSound");

let alarmArmed = false;
let previousAlertLevel = "ok";
let alertsExpanded = false;
let currentAlerts = [];
let currentAlertLevel = "ok";

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

function renderAlertsPill(){
  if (!alertCard || !alertState || !alertMsg) return;

  alertCard.classList.remove("alert-ok", "alert-warn", "alert-crit");

  if (!currentAlerts.length) {
    alertCard.classList.add("alert-ok");
    alertState.textContent = "OK";
    alertMsg.textContent = alertsExpanded ? "System operating normally" : "";
    return;
  }

  if (currentAlertLevel === "crit") {
    alertCard.classList.add("alert-crit");
    alertState.textContent = "CRITICAL";
  } else {
    alertCard.classList.add("alert-warn");
    alertState.textContent = "WARNING";
  }

  alertMsg.textContent = alertsExpanded ? currentAlerts.join(" | ") : "";
}

// ===================== SAFE JSON PARSE =====================
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
    clearCharts();
  });
}

// ===================== CROP SELECTION =====================
function hookCropSelect(){
  const sel = $("cropSelect");
  if (!sel) return;

  sel.addEventListener("change", () => {
    const crop = sel.value;
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

// ===================== HISTORY =====================
function hookHistoryBtn(){
  const btn = $("historyBtn");
  const panel = $("historyPanel");
  if (!btn || !panel) return;

  btn.addEventListener("click", () => {
    panel.style.display = (panel.style.display === "none" || !panel.style.display) ? "block" : "none";
  });
}

function showHistoryEmpty(msg = "No historical data for this selection."){
  setText("historyEmpty", msg);
  $("historyEmpty").style.display = "block";
  $("historyTableWrap").style.display = "none";
}

function showHistoryTable(){
  $("historyEmpty").style.display = "none";
  $("historyTableWrap").style.display = "block";
}

function renderHistoryTable(dayData){
  const tbody = $("historyTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const slotOrder = [
    "slot_00_06",
    "slot_06_12",
    "slot_12_18",
    "slot_18_00"
  ];

  const slotLabels = {
    slot_00_06: "00:00 - 06:00",
    slot_06_12: "06:00 - 12:00",
    slot_12_18: "12:00 - 18:00",
    slot_18_00: "18:00 - 00:00"
  };

  let hasAnyData = false;

  slotOrder.forEach(slot => {
    const row = dayData?.[slot];
    if (row) hasAnyData = true;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${slotLabels[slot]}</td>
      <td>${row ? fmt(row.air_temp, 1) : "--"}</td>
      <td>${row ? fmt(row.air_rh, 1) : "--"}</td>
      <td>${row ? fmt(row.ppfd, 1) : "--"}</td>
      <td>${row ? fmt(row.wind_kmh, 1) : "--"}</td>
      <td>${row ? fmt(row.pressure_hpa, 1) : "--"}</td>
      <td>${row ? fmt(row.rain_pct, 0) + "%" : "--"}</td>
      <td>${row ? fmt(row.pump_pct, 0) + "%" : "--"}</td>
    `;
    tbody.appendChild(tr);
  });

  if (!hasAnyData) {
    showHistoryEmpty("No historical data for this day.");
    return;
  }

  showHistoryTable();
}

async function loadAvailableMonths(){
  const sel = $("monthSelect");
  if (!sel || !window.firebaseDb) return;

  sel.innerHTML = `<option value="">Select month</option>`;

  try {
    const snap = await window.firebaseGet(window.firebaseRef(window.firebaseDb, "/history"));
    if (!snap.exists()) return;

    const data = snap.val();
    Object.keys(data).sort().forEach(monthKey => {
      const opt = document.createElement("option");
      opt.value = monthKey;
      opt.textContent = monthKey;
      sel.appendChild(opt);
    });
  } catch(err) {
    console.error("Failed to load months", err);
  }
}

async function loadHistoryForSelection(){
  const month = $("monthSelect")?.value;
  const day = $("dayPicker")?.value;

  if (!month || !day){
    showHistoryEmpty("Please select a month and a day.");
    return;
  }

  try {
    const path = `/history/${month}/${day}`;
    const snap = await window.firebaseGet(window.firebaseRef(window.firebaseDb, path));

    if (!snap.exists()) {
      showHistoryEmpty("No historical data for this day.");
      return;
    }

    const dayData = snap.val();
    renderHistoryTable(dayData);
  } catch(err){
    console.error("Unable to load historical data", err);
    showHistoryEmpty("Unable to load historical data.");
  }
}

function hookHistoryControls(){
  const loadBtn = $("loadHistoryBtn");
  if (loadBtn) {
    loadBtn.addEventListener("click", loadHistoryForSelection);
  }
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
  hookHistoryBtn();
  hookHistoryControls();
  loadAvailableMonths();
});

if (alertCard) {
  alertCard.addEventListener("click", (e) => {
    e.stopPropagation();
    alertsExpanded = !alertsExpanded;
    renderAlertsPill();
  });
}

document.addEventListener("click", () => {
  if (!alarm || alarmArmed) return;

  alarm.muted = true;
  alarm.play().then(() => {
    alarm.pause();
    alarm.currentTime = 0;
    alarm.muted = false;
    alarmArmed = true;
  }).catch(() => {});
}, { once: true });

// ===================== MQTT EVENTS =====================
client.on("connect", () => {
  setOnline(true, "MQTT Connected ✅");

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

// ===================== MESSAGE HANDLER =====================
client.on("message", (topic, message) => {
  const raw = message.toString();
  const d = safeParse(raw);
  if (!d) return;

  msgCount++;

  const crop         = d.crop;
  const airT         = d.air_temp;
  const airRH        = d.air_rh;
  const soilPct      = d.soil_pct;
  const lux          = d.lux;
  const ppfd         = d.ppfd;
  const pressHpa     = d.pressure_hpa;

  const windKmh      = (d.wind_kmh !== undefined && d.wind_kmh !== null)
    ? d.wind_kmh
    : ((d.wind_ms !== undefined && d.wind_ms !== null) ? (Number(d.wind_ms) * 3.6) : null);

  const vpdKpa       = d.vpd;
  const et0Rate      = d.et0_rate_mm_h;
  const et0Daily     = d.et0_daily_est_mm;

  const pump         = d.pump ?? "OFF";
  const isDay        = d.is_day;
  const pulsesDone   = d.pulses_done;
  const pulsesTarget = d.pulses_target;

  const isRaining    = d.is_raining;
  const rainAO       = d.rain_ao;
  const rainLockMin  = d.rain_lock_min;
  const rainDurMin   = d.rain_duration_min;

  setText("airT",  fmt(airT, 1));
  setText("airRH", fmt(airRH, 1));

  setText("soil", fmt(soilPct, 1));
  setText("soilUnit", "%");
  setText("soilSub", "Not controlling");

  const ppfdNum = Number(ppfd);
  setText("ppfd", (ppfd === null || ppfd === undefined || Number.isNaN(ppfdNum) || ppfdNum < 0) ? "--" : fmt(ppfdNum, 2));

  const luxNum = Number(lux);
  setText("lux", (lux === null || lux === undefined || Number.isNaN(luxNum) || luxNum < 0) ? "--" : Math.round(luxNum));

  setText("wind",  fmt(windKmh, 1));
  setText("press", fmt(pressHpa, 1));
  setText("vpd",   fmt(vpdKpa, 2));

  setText("edi", fmt(et0Rate, 3));
  setText("ediSub", `daily≈ ${fmt(et0Daily, 2)} mm/d`);

  setPumpBadge(pump);

  const dayTxt = (isDay === 1 || isDay === "1") ? "DAY ☀️" : "NIGHT 🌙";

  let cyclesTxt = "";
  const doneOk = pulsesDone !== undefined && pulsesDone !== null && !Number.isNaN(Number(pulsesDone));
  const targetOk = pulsesTarget !== undefined && pulsesTarget !== null && !Number.isNaN(Number(pulsesTarget));

  if (doneOk && targetOk) {
    cyclesTxt = ` • Cycles: ${pulsesDone}/${pulsesTarget}`;
  } else if (doneOk) {
    cyclesTxt = ` • Cycles: ${pulsesDone}`;
  }

  setText("dayNight", dayTxt + cyclesTxt);

  if (crop) syncCropSelectFromESP(crop);

  setText("timeLbl", "Last update: " + new Date().toLocaleTimeString());

  const raining = (isRaining === 1 || isRaining === "1" || isRaining === true);
  setText("rainState", raining ? "RAIN" : "NO RAIN");
  setText("rainUnit",  raining ? "🌧️" : "☀️");

  let sub = `AO: ${rainAO ?? "--"}`;
  const dur = Number(rainDurMin);
  if (raining) {
    sub += ` • Duration: ${(!Number.isNaN(dur) ? dur : "--")} min`;
  } else {
    if (!Number.isNaN(dur) && dur > 0) sub += ` • Last: ${dur} min`;
    const lock = Number(rainLockMin);
    sub += ` • Lock: ${(!Number.isNaN(lock) ? lock : "--")} min`;
  }
  setText("rainSub", sub);

  let alerts = [];
  let level = "ok";

  if (
    vpdKpa !== null && vpdKpa !== undefined &&
    !Number.isNaN(Number(vpdKpa)) &&
    Number(vpdKpa) > 1.4 &&
    et0Rate !== null && et0Rate !== undefined &&
    !Number.isNaN(Number(et0Rate)) &&
    Number(et0Rate) > 0.18
  ){
    alerts.push("🌱 Hydric stress");
    level = "warn";
  }

  if (
    airT !== null && airT !== undefined &&
    !Number.isNaN(Number(airT)) &&
    Number(airT) > 34 &&
    vpdKpa !== null && vpdKpa !== undefined &&
    !Number.isNaN(Number(vpdKpa)) &&
    Number(vpdKpa) > 1.8
  ){
    alerts.push("🌡 Heat stress");
    level = "warn";
  }

  if (
    et0Rate !== null && et0Rate !== undefined &&
    !Number.isNaN(Number(et0Rate)) &&
    Number(et0Rate) > 0.22
  ){
    alerts.push("🌬 Evapotranspiration high");
    level = "warn";
  }

  if (
    ppfd !== null && ppfd !== undefined &&
    !Number.isNaN(Number(ppfd)) &&
    Number(ppfd) > 400
  ){
    alerts.push("☀️ High radiation");
    level = "warn";
  }

  if (
    rainLockMin !== null && rainLockMin !== undefined &&
    !Number.isNaN(Number(rainLockMin)) &&
    Number(rainLockMin) > 0
  ){
    alerts.push("🌧 Rain lock active");
    level = "warn";
  }

  if (
    airT === null || airT === undefined ||
    airRH === null || airRH === undefined ||
    Number.isNaN(Number(airT)) || Number.isNaN(Number(airRH))
  ){
    alerts.push("❌ Temperature sensor disconnected");
    level = "crit";
  }

  if (
    pressHpa === null || pressHpa === undefined ||
    Number.isNaN(Number(pressHpa))
  ){
    alerts.push("❌ Pressure sensor disconnected");
    level = "crit";
  }

  if (
    windKmh === null || windKmh === undefined ||
    Number.isNaN(Number(windKmh))
  ){
    alerts.push("❌ Wind sensor disconnected");
    level = "crit";
  }

  if (
    ppfd === null || ppfd === undefined ||
    Number.isNaN(Number(ppfd))
  ){
    alerts.push("❌ Light sensor disconnected");
    level = "crit";
  }

  if (
    airT !== null && airT !== undefined &&
    !Number.isNaN(Number(airT)) &&
    Number(airT) > 38 &&
    vpdKpa !== null && vpdKpa !== undefined &&
    !Number.isNaN(Number(vpdKpa)) &&
    Number(vpdKpa) > 2.2
  ){
    alerts.push("🔥 Severe heat stress");
    level = "crit";
  }

  if (!client.connected) {
    alerts.push("❌ MQTT disconnected");
    level = "crit";
  }

  currentAlerts = alerts;
  currentAlertLevel = level;

  renderAlertsPill();

  if (alerts.length === 0) {
    previousAlertLevel = "ok";
  } else {
    if (alarmArmed && alarm && previousAlertLevel !== level) {
      alarm.currentTime = 0;
      alarm.play().catch(() => {});
    }
    previousAlertLevel = level;
  }

  const tLabel = new Date().toLocaleTimeString();
  updateChart(charts.temp,  tLabel, airT);
  updateChart(charts.soil,  tLabel, soilPct);
  updateChart(charts.wind,  tLabel, windKmh);
  updateChart(charts.press, tLabel, pressHpa);
  updateChart(charts.edi,   tLabel, et0Rate);
  updateChart(charts.ppfd,  tLabel, (ppfdNum < 0 ? null : ppfdNum));
});
