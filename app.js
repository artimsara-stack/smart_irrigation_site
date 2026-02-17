// ===== MQTT CONFIG =====
const brokerUrl = "wss://n1122166.ala.eu-central-1.emqxsl.com:8084/mqtt";
const options = {
  username: "sara",
  password: "12345678",
  clean: true,
  connectTimeout: 4000,
};

const topic = "smartirrigation/live";

const client = mqtt.connect(brokerUrl, options);

client.on("connect", () => {
  setConnected(true, "EMQX Connected ✅");
  client.subscribe(topic);
});

client.on("error", () => {
  setConnected(false, "MQTT Error");
});

client.on("message", (topic, message) => {
  const d = JSON.parse(message.toString());

  const air_temp = d.air_temp;
  const air_rh = d.air_rh;
  const soil_pct = d.soil_pct;
  const lux = d.lux;
  const ppfd = d.ppfd;
  const pump = d.pump;

  setText(el.airTemp, fmtNumber(air_temp, 1));
  setText(el.airRH, fmtNumber(air_rh, 1));
  setText(el.soil, fmtNumber(soil_pct, 1));
  setText(el.lux, lux);
  setText(el.ppfd, fmtNumber(ppfd, 2));
  setText(el.pumpPeriod, pump);

  setText(el.lastUpdate, new Date().toLocaleString());
});
