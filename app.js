// UI elements
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

function setText(node, value){ if(!node) return; node.textContent = value ?? "--"; }
function fmtNumber(v,d=1){ return typeof v==="number" && !Number.isNaN(v)?v.toFixed(d):"--"; }
function setConnected(ok,msg){ if(el.connDot) el.connDot.style.background = ok ? "#22c55e":"#ef4444"; setText(el.connText,msg); }

// Charts
let tempChart=null, soilChart=null;
const tempSeries={labels:[],values:[]}, soilSeries={labels:[],values:[]};

function pushPoint(series,label,value,maxPoints=30){
  series.labels.push(label); series.values.push(value);
  while(series.labels.length>maxPoints){ series.labels.shift(); series.values.shift(); }
}

function ensureCharts(){
  if(!window.Chart) return;

  if(!tempChart){
    const ctx=document.getElementById("tempChart")?.getContext("2d");
    if(ctx) tempChart = new Chart(ctx,{type:"line",data:{labels:tempSeries.labels,datasets:[{label:"Air Temp (°C)",data:tempSeries.values,tension:0.3}]},options:{responsive:true,animation:false,scales:{y:{beginAtZero:false}}}});
  }
  if(!soilChart){
    const ctx=document.getElementById("soilChart")?.getContext("2d");
    if(ctx) soilChart = new Chart(ctx,{type:"line",data:{labels:soilSeries.labels,datasets:[{label:"Soil (%)",data:soilSeries.values,tension:0.3}]},options:{responsive:true,animation:false,scales:{y:{min:0,max:100}}}});
  }
}

// ---------- EMQX MQTT ----------
const client = mqtt.connect("wss://YOUR_ENDPOINT:YOUR_PORT/mqtt",{
  username:"YOUR_USERNAME",
  password:"YOUR_PASSWORD",
  reconnectPeriod:2000
});

let historyBuffer=[];

client.on("connect",()=>{
  setConnected(true,"Live (EMQX)");
  client.subscribe("smart_irrigation/live");
});

client.on("error",()=>{ setConnected(false,"MQTT Error"); });

client.on("message",(topic,message)=>{
  try{
    const d = JSON.parse(message.toString());

    // Update KPIs
    setText(el.airTemp, fmtNumber(d.air_temp));
    setText(el.airRH, fmtNumber(d.air_rh));
    setText(el.soil, fmtNumber(d.soil_pct));
    setText(el.lux, d.lux ?? "--");
    setText(el.ppfd, fmtNumber(d.ppfd,2));
    
    // Pump card
    let pumpLine = d.pump ?? "--";
    if(d.crop) pumpLine += ` • ${d.crop}`;
    if(typeof d.irrig_ms==="number") pumpLine += ` • ${d.irrig_ms}ms`;
    setText(el.pumpPeriod,pumpLine);

    setText(el.lastUpdate,new Date().toLocaleString());

    // Update charts
    ensureCharts();
    const label = new Date().toLocaleTimeString();
    if(typeof d.air_temp==="number"){ pushPoint(tempSeries,label,d.air_temp); tempChart?.update(); }
    if(typeof d.soil_pct==="number"){ pushPoint(soilSeries,label,d.soil_pct); soilChart?.update(); }

    // Keep last 30 points
    historyBuffer.push(d);
    if(historyBuffer.length>30) historyBuffer.shift();

  }catch(e){ console.error("MQTT message error:",e); }
});
