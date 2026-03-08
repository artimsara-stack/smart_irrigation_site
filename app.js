/* =========================================================
   Smart Irrigation Dashboard — MQTT (EMQX)
   + Alerts system
   ========================================================= */

const MQTT_HOST = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER = "sara";
const MQTT_PASS = "12345678";
const MQTT_TOPIC = "smart/irrigation";
const MQTT_CMD_TOPIC = "smart/irrigation/cmd";

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
    console.log("JSON parse error", e);
    return null;
  }
}

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
        borderWidth: 2
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
        x: { ticks: { maxTicksLimit: 8 }},
        y: { beginAtZero: false }
      }
    }
  });

  return { chart, labels, data };
}

function initCharts(){

  charts.temp = makeLineChart("cTemp","Air Temperature");
  charts.soil = makeLineChart("cSoil","Soil");
  charts.wind = makeLineChart("cWind","Wind");
  charts.press = makeLineChart("cPress","Pressure");
  charts.edi = makeLineChart("cEdi","ET0");
  charts.ppfd = makeLineChart("cPpfd","PPFD");

}

function updateChart(ref,label,v){
  if (!ref) return;

  const x = Number(v);
  if (v === null || v === undefined || Number.isNaN(x)) return;

  addPoint(ref,label,x);
}

setOnline(false,"Connecting...");

let msgCount = 0;

const client = mqtt.connect(MQTT_HOST,{
  username:MQTT_USER,
  password:MQTT_PASS,
  clientId:"dash_"+Math.random().toString(16).slice(2),
  clean:true,
  reconnectPeriod:2500
});

window.addEventListener("load",()=>{

  initCharts();

});

client.on("connect",()=>{

  setOnline(true,"MQTT Connected");

  client.subscribe(MQTT_TOPIC);

});

client.on("reconnect",()=>setOnline(false,"Reconnecting..."));

client.on("close",()=>setOnline(false,"Disconnected"));

client.on("error",(e)=>{

  console.log(e);
  setOnline(false,"MQTT Error");

});

client.on("message",(topic,message)=>{

  const raw = message.toString();

  const d = safeParse(raw);
  if (!d) return;

  msgCount++;

  const crop = d.crop;
  const airT = d.air_temp;
  const airRH = d.air_rh;
  const soilPct = d.soil_pct;

  const lux = d.lux;
  const ppfd = d.ppfd;

  const pressHpa = d.pressure_hpa;

  const windKmh = d.wind_kmh;

  const vpdKpa = d.vpd;
  const et0Rate = d.et0_rate_mm_h;
  const et0Daily = d.et0_daily_est_mm;

  const pump = d.pump ?? "OFF";
  const isDay = d.is_day;

  const isRaining = d.is_raining;

  setText("airT",fmt(airT,1));
  setText("airRH",fmt(airRH,1));

  setText("soil",fmt(soilPct,1));

  setText("ppfd",fmt(ppfd,1));
  setText("lux",Math.round(lux));

  setText("wind",fmt(windKmh,1));
  setText("press",fmt(pressHpa,1));
  setText("vpd",fmt(vpdKpa,2));

  setText("edi",fmt(et0Rate,3));
  setText("ediSub",`daily≈ ${fmt(et0Daily,2)} mm/d`);

  setPumpBadge(pump);

  setText("dayNight",(isDay==1?"DAY ☀️":"NIGHT 🌙"));

  setText("cropLbl",crop||"--");

  setText("timeLbl","Last update: "+new Date().toLocaleTimeString());

  const raining = (isRaining==1);

  setText("rainState",raining?"RAIN":"NO RAIN");

  let alerts = [];

  if(airT !== null && airT > 32){
    alerts.push("⚠ High temperature");
  }

  if(airRH !== null && airRH < 40){
    alerts.push("⚠ Low humidity");
  }

  if(vpdKpa !== null && vpdKpa > 1.5){
    alerts.push("⚠ High VPD");
  }

  if(ppfd !== null && ppfd > 400){
    alerts.push("⚠ High radiation");
  }

  if(raining){
    alerts.push("🌧 Rain detected");
  }

  if(airT === null || airRH === null){
    alerts.push("❌ Temperature sensor disconnected");
  }

  if(ppfd === null){
    alerts.push("❌ Light sensor disconnected");
  }

  if(pressHpa === null){
    alerts.push("❌ Pressure sensor disconnected");
  }

  if(windKmh === null){
    alerts.push("❌ Wind sensor disconnected");
  }

  if(!client.connected){
    alerts.push("❌ MQTT disconnected");
  }

  if(alerts.length === 0){
    setText("alerts","System OK");
  }else{
    setText("alerts",alerts.join(" | "));
  }

  const tLabel = new Date().toLocaleTimeString();

  updateChart(charts.temp,tLabel,airT);
  updateChart(charts.soil,tLabel,soilPct);
  updateChart(charts.wind,tLabel,windKmh);
  updateChart(charts.press,tLabel,pressHpa);
  updateChart(charts.edi,tLabel,et0Rate);
  updateChart(charts.ppfd,tLabel,ppfd);

});
