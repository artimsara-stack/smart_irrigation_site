const broker = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const options = {
  username: "sara",
  password: "12345678",
  clean: true,
  connectTimeout: 4000
};

const client = mqtt.connect(broker, options);

const topic = "smart/irrigation/#";

const dot = document.getElementById("dot");
const statusTxt = document.getElementById("statusTxt");

client.on("connect", () => {
  dot.classList.add("ok");
  statusTxt.innerText = "Live";
  client.subscribe(topic);
});

client.on("error", () => {
  statusTxt.innerText = "Connection error";
});

const charts = {};
function createChart(id,label){
  return new Chart(document.getElementById(id),{
    type:"line",
    data:{labels:[],datasets:[{label,data:[],borderColor:"#38bdf8"}]},
    options:{responsive:true,animation:false}
  });
}

charts.temp=createChart("tempChart","Temp °C");
charts.soil=createChart("soilChart","Soil %");
charts.wind=createChart("windChart","Wind m/s");
charts.press=createChart("pressChart","Pressure hPa");

function updateChart(chart,value){
  if(isNaN(value)) return;
  chart.data.labels.push("");
  chart.data.datasets[0].data.push(value);
  if(chart.data.labels.length>30){
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

client.on("message",(topic,message)=>{
  const data=JSON.parse(message.toString());

  document.getElementById("airT").innerText=data.air_temp?.toFixed(1);
  document.getElementById("airRH").innerText=data.air_rh?.toFixed(1);
  document.getElementById("soil").innerText=data.soil_pct?.toFixed(1);
  document.getElementById("ppfd").innerText=data.ppfd?.toFixed(2);
  document.getElementById("wind").innerText=data.wind_ms?.toFixed(2);
  document.getElementById("pressure").innerText=data.pressure_hpa?.toFixed(1);
  document.getElementById("vpd").innerText=data.vpd?.toFixed(2);
  document.getElementById("et0").innerText=data.et0_rate_mm_h?.toFixed(3);

  const pump=document.getElementById("pumpBadge");
  if(data.pump==="ON"){
    pump.classList.remove("off");
    pump.classList.add("on");
    pump.innerText="PUMP ON";
  }else{
    pump.classList.remove("on");
    pump.classList.add("off");
    pump.innerText="PUMP OFF";
  }

  updateChart(charts.temp,data.air_temp);
  updateChart(charts.soil,data.soil_pct);
  updateChart(charts.wind,data.wind_ms);
  updateChart(charts.press,data.pressure_hpa);
});
