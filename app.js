// ======= CONFIG =======
const DB = "https://smart-irrigation-site-90e51-default-rtdb.firebaseio.com";

// إذا درتو Rules بالـ secret داخل JSON، القراءة ما كتحتاجش token.
// (إلا عندكم token فـ read، نزيدوه هنا)
const READ_TOKEN = ""; // مثال: "AZURA123" أو خليه فارغ ""

// عدد النقاط في الرسم
const LIMIT = 30;
const REFRESH_MS = 3000;

// ======= HELPERS =======
function withToken(url){
  if(!READ_TOKEN) return url;
  // Firebase REST query separator
  return url.includes("?") ? `${url}&token=${READ_TOKEN}` : `${url}?token=${READ_TOKEN}`;
}

function setText(id, value){
  document.getElementById(id).textContent = (value === null || value === undefined) ? "--" : value;
}

function nowStr(){
  return new Date().toLocaleString();
}

// ======= CHARTS =======
const chartTemp = new Chart(document.getElementById("chartTemp"), {
  type: "line",
  data: { labels: [], datasets: [{ label: "Air Temp (°C)", data: [] }] },
  options: { responsive: true, animation: false }
});

const chartSoil = new Chart(document.getElementById("chartSoil"), {
  type: "line",
  data: { labels: [], datasets: [{ label: "Soil (%)", data: [] }] },
  options: { responsive: true, animation: false }
});

// ======= FETCH LAST =======
async function refreshLast(){
  const url = withToken(`${DB}/last.json`);
  const r = await fetch(url);
  const d = await r.json();

  if(!d){
    setText("status", "Status: no data in /last");
    return null;
  }

  setText("air_temp", d.air_temp?.toFixed ? d.air_temp.toFixed(1) : d.air_temp);
  setText("air_rh",   d.air_rh?.toFixed ? d.air_rh.toFixed(1) : d.air_rh);
  setText("soil",     d.soil?.toFixed ? d.soil.toFixed(1) : d.soil);
  setText("lux",      d.lux);
  setText("ppfd",     d.ppfd?.toFixed ? d.ppfd.toFixed(1) : d.ppfd);

  const pump = d.pump ?? "--";
  const period = d.period ?? "--";
  setText("pump_period", `${pump} / ${period}`);

  setText("status", "Status: OK");
  setText("updated", "Updated: " + nowStr());

  return d;
}

// ======= FETCH HISTORY =======
async function refreshHistory(){
  // history stored as object: { key1: {...}, key2: {...} }
  // We'll take last LIMIT by sorting keys.
  const url = withToken(`${DB}/history.json`);
  const r = await fetch(url);
  const obj = await r.json();
  if(!obj) return;

  const keys = Object.keys(obj).sort((a,b) => Number(a) - Number(b));
  const lastKeys = keys.slice(-LIMIT);
  const data = lastKeys.map(k => obj[k]);

  // labels: use seconds from key (millis-based)
  const labels = lastKeys.map(k => `${Math.round(Number(k)/1000)}s`);

  chartTemp.data.labels = labels;
  chartSoil.data.labels = labels;

  chartTemp.data.datasets[0].data = data.map(x => x.air_temp ?? null);
  chartSoil.data.datasets[0].data = data.map(x => x.soil ?? null);

  chartTemp.update();
  chartSoil.update();
}

// ======= LOOP =======
async function tick(){
  try{
    await refreshLast();
    await refreshHistory();
  }catch(e){
    setText("status", "Status: error (check DB URL / CORS / rules)");
    console.error(e);
  }
}

setInterval(tick, REFRESH_MS);
tick();
