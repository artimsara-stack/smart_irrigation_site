// app.js (Safari-friendly) — Paho MQTT over WSS
const HOST  = "n1122166.ala.eu-central-1.emqxsl.com";
const PORT  = 8084;
const PATH  = "/mqtt";
const USER  = "sara";
const PASS  = "12345678";
const TOPIC = "smart/irrigation";

const $ = (id)=>document.getElementById(id);

function setOnline(ok,msg){
  const dot = $("dot");
  dot.classList.remove("ok","no");
  dot.classList.add(ok ? "ok" : "no");
  $("statusTxt").textContent = msg;
}
function fmt(x,n=1){
  const v = Number(x);
  return Number.isFinite(v) ? v.toFixed(n) : "--";
}
function setPump(state){
  const badge = $("pumpBadge");
  const txt = $("pumpTxt");
  const st = String(state||"").toUpperCase();
  if(st==="ON"){
    badge.classList.add("on"); badge.classList.remove("off");
    txt.textContent="PUMP ON";
  }else{
    badge.classList.add("off"); badge.classList.remove("on");
    txt.textContent="PUMP OFF";
  }
}

// Charts
function makeChart(canvasId,label){
  return new Chart($(canvasId),{
    type:"line",
    data:{labels:[],datasets:[{label,data:[]}]},
    options:{responsive:true,animation:false,plugins:{legend:{display:false}}}
  });
}
const chTemp = makeChart("cTemp","Temp");
const chHum  = makeChart("cHum","Humidity");
const chSoil = makeChart("cSoil","Soil ADC");
const chPump = makeChart("cPump","Pump");

const HIST_MAX=30;
const hist=[]; // {t,h,s,p}
function updateCharts(){
  const labels = hist.map((_,i)=>String(i+1));
  chTemp.data.labels=labels; chHum.data.labels=labels; chSoil.data.labels=labels; chPump.data.labels=labels;
  chTemp.data.datasets[0].data=hist.map(x=>x.t);
  chHum.data.datasets[0].data =hist.map(x=>x.h);
  chSoil.data.datasets[0].data=hist.map(x=>x.s);
  chPump.data.datasets[0].data=hist.map(x=>x.p);
  chTemp.update(); chHum.update(); chSoil.update(); chPump.update();
}

let client=null;

function connectMQTT(){
  setOnline(false,"Connecting MQTT…");

  const clientId = "dash_" + Math.random().toString(16).slice(2);
  client = new Paho.MQTT.Client(HOST, Number(PORT), PATH, clientId);

  client.onConnectionLost = ()=> setOnline(false,"Disconnected");
  client.onMessageArrived = (msg)=>{
    try{
      const d = JSON.parse(msg.payloadString);

      $("airT").textContent  = fmt(d.temperature,1);
      $("airRH").textContent = fmt(d.humidity,1);
      $("soil").textContent  = (d.soil_adc ?? "--");
      setPump(d.pump);
      $("timeLbl").textContent = "Last update: " + new Date().toLocaleTimeString();

      const t=Number(d.temperature), h=Number(d.humidity), s=Number(d.soil_adc);
      const p=(String(d.pump||"").toUpperCase()==="ON")?1:0;

      hist.push({t:Number.isFinite(t)?t:null,h:Number.isFinite(h)?h:null,s:Number.isFinite(s)?s:null,p});
      while(hist.length>HIST_MAX) hist.shift();
      updateCharts();
    }catch(e){
      console.log("JSON error",e);
    }
  };

  client.connect({
    useSSL:true,
    userName:USER,
    password:PASS,
    timeout:8,
    onSuccess:()=>{
      setOnline(true,"MQTT Connected");
      client.subscribe(TOPIC,{qos:0});
    },
    onFailure:(err)=>{
      console.log("Connect fail", err);
      setOnline(false,"MQTT Error");
    }
  });
}

$("reconnectBtn").addEventListener("click", connectMQTT);
connectMQTT();
