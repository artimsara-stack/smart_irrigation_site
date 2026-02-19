// ===== MQTT CONFIG =====
const MQTT_URL = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const MQTT_OPTIONS = {
  username: "sara",
  password: "12345678",
  clientId: "dashboard_" + Math.random().toString(16).substr(2,8),
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 3000
};

const MQTT_TOPIC = "smart/irrigation";

// ===== UI =====
const airT = document.getElementById("airT");
const airRH = document.getElementById("airRH");
const soil = document.getElementById("soil");
const pumpBadge = document.getElementById("pumpBadge");
const dot = document.getElementById("dot");
const statusTxt = document.getElementById("statusTxt");

function setStatus(ok, msg){
  dot.classList.remove("ok","no");
  dot.classList.add(ok ? "ok" : "no");
  statusTxt.textContent = msg;
}

// ===== Charts =====
const tempCtx = document.getElementById("tempChart");
const soilCtx = document.getElementById("soilChart");

const tempChart = new Chart(tempCtx,{
  type:"line",
  data:{labels:[],datasets:[{label:"Temperature °C",data:[]}]},
  options:{responsive:true,animation:false}
});

const soilChart = new Chart(soilCtx,{
  type:"line",
  data:{labels:[],datasets:[{label:"Soil ADC",data:[]}]},
  options:{responsive:true,animation:false}
});

let historyBuffer = [];

function updateCharts(data){
  historyBuffer.push(data);
  if(historyBuffer.length > 30) historyBuffer.shift();

  const labels = historyBuffer.map((_,i)=>i+1);

  tempChart.data.labels = labels;
  soilChart.data.labels = labels;

  tempChart.data.datasets[0].data =
    historyBuffer.map(x=>x.temperature);

  soilChart.data.datasets[0].data =
    historyBuffer.map(x=>x.soil_adc);

  tempChart.update();
  soilChart.update();
}

// ===== MQTT CONNECT =====
setStatus(false,"Connecting MQTT...");

const client = mqtt.connect(MQTT_URL, MQTT_OPTIONS);

client.on("connect", ()=>{
  setStatus(true,"MQTT Connected");
  client.subscribe(MQTT_TOPIC);
});

client.on("error",(err)=>{
  console.log("MQTT Error:",err);
  setStatus(false,"Connection Error");
});

client.on("message",(topic,message)=>{
  try{
    const data = JSON.parse(message.toString());

    airT.textContent = data.temperature ?? "--";
    airRH.textContent = data.humidity ?? "--";
    soil.textContent = data.soil_adc ?? "--";

    if(data.pump === "ON"){
      pumpBadge.textContent = "ON";
      pumpBadge.classList.remove("off");
      pumpBadge.classList.add("on");
    }else{
      pumpBadge.textContent = "OFF";
      pumpBadge.classList.remove("on");
      pumpBadge.classList.add("off");
    }

    updateCharts(data);

  }catch(e){
    console.log("JSON error",e);
  }
});
