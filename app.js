/***********************
 * Smart Irrigation — MQTT Dashboard
 * Compatible with your ESP32 payloads:
 *  - "temperature/humidity/soil_adc/pump"
 *  - OR "air_temp/air_rh/soil_pct/wind_ms/pressure_hpa/ppfd/lux/vpd/et0_daily_est_mm/pump/is_day..."
 ***********************/

// ===== EMQX WSS CONFIG (Browser) =====
const MQTT_URL  = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER = "sara";
const MQTT_PASS = "12345678";

// ESP32 publishes here:
const MQTT_TOPIC_SUB = "smart/irrigation/#";   // subscribe wildcard
const MQTT_TOPIC_PUB = "smart/irrigation";     // label only

// ===== UI =====
const $ = (id) => document.getElementById(id);

const ui = {
  dot: $("dot"),
  statusTxt: $("statusTxt"),
  airT: $("airT"),
  airRH: $("airRH"),
  soil: $("soil"),
  soilUnit: $("soilUnit"),
  soilSub: $("soilSub"),
  wind: $("wind"),
  press: $("press"),
  lux: $("lux"),
  ppfd: $("ppfd"),
  vpd: $("vpd"),
  edi: $("edi"),
  ediSub: $("ediSub"),
  pumpBadge: $("pumpBadge"),
  timeLbl: $("timeLbl"),
  dayNight: $("dayNight"),
  topicLbl: $("topicLbl"),
  msgCount: $("msgCount"),
  themeBtn: $("themeBtn"),
  clearBtn: $("clearBtn"),
};

// ===== Helpers =====
function setOnline(ok, msg){
  ui.dot.classList.remove("ok","no");
  ui.dot.classList.add(ok ? "ok" : "no");
  ui.statusTxt.textContent = msg;
}

function fmtNum(v, digits=1){
  const n = Number(v);
  if (v === null || v === undefined || Number.isNaN(n)) return "--";
  return n.toFixed(digits);
}

function pick(obj, keys){
  for(const k of keys){
    if(obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

function setPump(state){
  const on = String(state || "").toUpperCase() === "ON";
  ui.pumpBadge.textContent = on ? "ON" : "OFF";
  ui.pumpBadge.classList.toggle("on", on);
  ui.pumpBadge.classList.toggle("off", !on);
}

// ===== Charts =====
function makeLineChart(canvasId){
  return new Chart($(canvasId), {
    type:"line",
    data:{ labels:[], datasets:[{ data:[], tension:0.25, pointRadius:2 }] },
    options:{
      responsive:true,
      animation:false,
      plugins:{ legend:{display:false} },
      scales:{ x:{ ticks:{maxTicksLimit:8} }, y:{ beginAtZero:false } }
    }
  });
}

const chTemp = makeLineChart("cTemp");
const chSoil = makeLineChart("cSoil");
const chWind = makeLineChart("cWind");
const chPress= makeLineChart("cPress");
const chEdi  = makeLineChart("cEdi");
const chPpfd = makeLineChart("cPpfd");

const history = [];
const MAX_POINTS = 30;

function pushHistory(point){
  history.push(point);
  while(history.length > MAX_POINTS) history.shift();
}

function redrawCharts(){
  const labels = history.map(p => p._t);

  function series(key){
    return history.map(p => (typeof p[key] === "number" && !Number.isNaN(p[key])) ? p[key] : null);
  }

  chTemp.data.labels = labels;
  chSoil.data.labels = labels;
  chWind.data.labels = labels;
  chPress.data.labels= labels;
  chEdi.data.labels  = labels;
  chPpfd.data.labels = labels;

  chTemp.data.datasets[0].data = series("temp");
  chSoil.data.datasets[0].data = series("soil");
  chWind.data.datasets[0].data = series("wind");
  chPress.data.datasets[0].data= series("press");
  chEdi.data.datasets[0].data  = series("edi");
  chPpfd.data.datasets[0].data = series("ppfd");

  chTemp.update(); chSoil.update(); chWind.update();
  chPress.update(); chEdi.update(); chPpfd.update();
}

// ===== Theme / Clear =====
ui.themeBtn?.addEventListener("click", ()=>{
  document.body.dataset.theme =
    (document.body.dataset.theme === "light") ? "dark" : "light";
});

ui.clearBtn?.addEventListener("click", ()=>{
  history.length = 0;
  redrawCharts();
  ui.msgCount.textContent = "0";
});

// ===== MQTT Connect =====
ui.topicLbl.textContent = MQTT_TOPIC_PUB;

setOnline(false, "Connecting...");
const client = mqtt.connect(MQTT_URL, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: "dash_" + Math.random().toString(16).slice(2,10),
  clean: true,
  connectTimeout: 8000,
  reconnectPeriod: 2000,
});

client.on("connect", ()=>{
  setOnline(true, "MQTT Connected");
  client.subscribe(MQTT_TOPIC_SUB, { qos: 0 }, (err)=>{
    if(err){
      console.error("Subscribe error:", err);
      setOnline(false, "Subscribe error");
    }
  });
});

client.on("reconnect", ()=> setOnline(false, "Reconnecting..."));
client.on("close", ()=> setOnline(false, "Disconnected"));
client.on("error", (e)=> {
  console.error("MQTT error:", e);
  setOnline(false, "MQTT Error");
});

// ===== Message handler =====
let count = 0;

client.on("message", (topic, msg)=>{
  count++;
  ui.msgCount.textContent = String(count);

  let d;
  try{
    d = JSON.parse(msg.toString());
  }catch(e){
    console.warn("Not JSON:", msg.toString());
    return;
  }

  // ---- Map payload (support both ESP versions) ----
  const airT = pick(d, ["air_temp","temperature","temp","tAir"]);
  const airRH= pick(d, ["air_rh","humidity","rh"]);
  const soilPct = pick(d, ["soil_pct","soil","soilPct"]);
  const soilAdc = pick(d, ["soil_adc","soilADC"]);

  const wind = pick(d, ["wind_ms","wind_speed","wind"]);
  const press= pick(d, ["pressure_hpa","press","pressure"]);
  const lux  = pick(d, ["lux"]);
  const ppfd = pick(d, ["ppfd","ppfd_val","light_ppfd"]);

  const vpd  = pick(d, ["vpd","VPD"]);
  // EDI could be: "edi" OR your ET0 daily estimate
  const edi  = pick(d, ["edi","EDI","et0_daily_est_mm","et0_rate_mm_h","et0","eto"]);

  const pump = pick(d, ["pump","relay","pump_state"]);

  const isDay = pick(d, ["is_day","day","isDay"]);

  // ---- UI update ----
  ui.airT.textContent  = fmtNum(airT, 1);
  ui.airRH.textContent = fmtNum(airRH,1);

  // Soil: if % exists use %, else show ADC
  if(soilPct !== null && soilPct !== undefined){
    ui.soil.textContent = fmtNum(soilPct,1);
    ui.soilUnit.textContent = "%";
    ui.soilSub.textContent = "Monitor";
  }else{
    ui.soil.textContent = (soilAdc === null ? "--" : String(soilAdc));
    ui.soilUnit.textContent = "";
    ui.soilSub.textContent = "ADC";
  }

  ui.wind.textContent  = fmtNum(wind,2);
  ui.press.textContent = fmtNum(press,1);

  ui.lux.textContent   = (lux === null || lux === undefined || Number.isNaN(Number(lux))) ? "--" : String(Math.round(Number(lux)));
  ui.ppfd.textContent  = fmtNum(ppfd,2);

  ui.vpd.textContent   = fmtNum(vpd,2);

  // EDI label depending on what we receive
  if(d.et0_daily_est_mm !== undefined) ui.ediSub.textContent = "ET0 daily (mm)";
  else if(d.et0_rate_mm_h !== undefined) ui.ediSub.textContent = "ET0 rate (mm/h)";
  else ui.ediSub.textContent = "index";
  ui.edi.textContent   = fmtNum(edi,2);

  setPump(pump);

  if(isDay === 1 || isDay === "1" || isDay === true) ui.dayNight.textContent = "DAY";
  else if(isDay === 0 || isDay === "0" || isDay === false) ui.dayNight.textContent = "NIGHT";
  else ui.dayNight.textContent = "--";

  ui.timeLbl.textContent = "Last update: " + new Date().toLocaleTimeString();

  // ---- Push to charts ----
  pushHistory({
    _t: new Date().toLocaleTimeString().slice(0,8),
    temp: Number(airT),
    soil: (soilPct !== null && soilPct !== undefined) ? Number(soilPct) : Number(soilAdc),
    wind: Number(wind),
    press:Number(press),
    edi:  Number(edi),
    ppfd: Number(ppfd),
  });

  redrawCharts();
});
