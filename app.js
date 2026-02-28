// ===================== MQTT CONFIG =====================
const MQTT_HOST  = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER  = "sara";
const MQTT_PASS  = "12345678";

const MQTT_TOPIC      = "smart/irrigation";
const MQTT_CMD_TOPIC  = "smart/irrigation/cmd";   // 🔥 NEW

// ===================== DOM HELPERS =====================
const $ = (id) => document.getElementById(id);

function setText(id, v){
  const n = $(id);
  if (!n) return;
  n.textContent = (v === undefined || v === null) ? "--" : String(v);
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

// ===================== MQTT CONNECT =====================
setOnline(false,"Connecting...");

const client = mqtt.connect(MQTT_HOST, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: "dash_" + Math.random().toString(16).slice(2),
  clean: true,
  reconnectPeriod: 3000
});

client.on("connect", ()=>{
  setOnline(true,"MQTT Connected");
  client.subscribe(MQTT_TOPIC);
});

client.on("reconnect", ()=> setOnline(false,"Reconnecting..."));
client.on("close", ()=> setOnline(false,"Disconnected"));
client.on("error", ()=> setOnline(false,"MQTT Error"));

// ===================== SEND CROP COMMAND =====================
function sendCropCommand(crop){
  if (!client.connected){
    setOnline(false,"CMD not sent");
    return;
  }

  const payload = JSON.stringify({ crop: crop });
  client.publish(MQTT_CMD_TOPIC, payload);
}

// ===================== MESSAGE HANDLER =====================
client.on("message",(topic,message)=>{
  const raw = message.toString();

  let d;
  try{
    d = JSON.parse(raw);
  }catch{
    return;
  }

  // KPIs
  setText("airT", fmt(d.air_temp,1));
  setText("airRH", fmt(d.air_rh,1));
  setText("soil", fmt(d.soil_pct,1));
  setText("ppfd", fmt(d.ppfd,2));
  setText("wind", fmt(d.wind_ms,2));
  setText("press", fmt(d.pressure_hpa,1));
  setText("vpd", fmt(d.vpd,2));
  setText("edi", fmt(d.et0_rate_mm_h,3));

  // Pump
  if ($("pumpBadge")){
    $("pumpBadge").textContent = d.pump;
    $("pumpBadge").classList.toggle("on", d.pump==="ON");
    $("pumpBadge").classList.toggle("off", d.pump!=="ON");
  }

  // 🔥 Crop sync from ESP
  if (d.crop){
    setText("cropLive", d.crop);

    const sel = $("cropSelect");
    if (sel && sel.value !== d.crop){
      sel.value = d.crop;
    }
  }
});

// ===================== SELECT LISTENER =====================
window.addEventListener("load",()=>{

  const cropSel = $("cropSelect");

  if (cropSel){
    cropSel.addEventListener("change", ()=>{
      sendCropCommand(cropSel.value);
    });
  }

});
