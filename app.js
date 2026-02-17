const MQTT_URL="wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_USER="sara";
const MQTT_PASS="12345678";
const MQTT_TOPIC="smart/irrigation";

const $=id=>document.getElementById(id);

function setOnline(ok,msg){
  const dot=$("dot");
  dot.classList.remove("ok","no");
  dot.classList.add(ok?"ok":"no");
  $("statusTxt").textContent=msg;
}

function setPump(state){
  const badge=$("pumpBadge");
  const txt=$("pumpTxt");
  if(String(state).toUpperCase()==="ON"){
    badge.classList.add("on");
    badge.classList.remove("off");
    txt.textContent="PUMP ON";
  }else{
    badge.classList.add("off");
    badge.classList.remove("on");
    txt.textContent="PUMP OFF";
  }
}

function makeChart(id){
  return new Chart($(id),{
    type:"line",
    data:{labels:[],datasets:[{data:[]}]},
    options:{responsive:true,animation:false}
  });
}

const chT=makeChart("cTemp");
const chH=makeChart("cHum");
const chS=makeChart("cSoil");
const chP=makeChart("cPump");

const hist=[];

function updateCharts(){
  const labels=hist.map((_,i)=>i+1);
  [chT,chH,chS,chP].forEach(ch=>ch.data.labels=labels);

  chT.data.datasets[0].data=hist.map(x=>x.t);
  chH.data.datasets[0].data=hist.map(x=>x.h);
  chS.data.datasets[0].data=hist.map(x=>x.s);
  chP.data.datasets[0].data=hist.map(x=>x.p);

  chT.update();chH.update();chS.update();chP.update();
}

let client;

function connectMQTT(){
  setOnline(false,"Connecting...");
  client=mqtt.connect(MQTT_URL,{
    username:MQTT_USER,
    password:MQTT_PASS,
    reconnectPeriod:3000
  });

  client.on("connect",()=>{
    setOnline(true,"MQTT Connected");
    client.subscribe(MQTT_TOPIC);
  });

  client.on("message",(topic,msg)=>{
    if(topic!==MQTT_TOPIC)return;

    const d=JSON.parse(msg.toString());

    $("airT").textContent=d.temperature??"--";
    $("airRH").textContent=d.humidity??"--";
    $("soil").textContent=d.soil_adc??"--";
    setPump(d.pump);

    $("timeLbl").textContent="Last update: "+new Date().toLocaleTimeString();

    hist.push({
      t:Number(d.temperature),
      h:Number(d.humidity),
      s:Number(d.soil_adc),
      p:String(d.pump).toUpperCase()==="ON"?1:0
    });

    if(hist.length>30)hist.shift();
    updateCharts();
  });

  client.on("reconnect",()=>setOnline(false,"Reconnecting..."));
  client.on("close",()=>setOnline(false,"Disconnected"));
  client.on("error",()=>setOnline(false,"Error"));
}

$("reconnectBtn").addEventListener("click",connectMQTT);
$("themeBtn").addEventListener("click",()=>{
  document.body.dataset.theme=
  document.body.dataset.theme==="dark"?"light":"dark";
});

connectMQTT();
