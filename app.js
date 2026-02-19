<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Smart Irrigation Dashboard</title>

  <!-- CSS ديالك -->
  <link rel="stylesheet" href="style.css">

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

  <!-- MQTT.js -->
  <script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script>
</head>

<body>
<div class="container">

<header>
  <div class="title">
    <div class="logo"></div>
    <div>
      <h2>Smart Irrigation</h2>
      <div class="subtitle">ESP32 → MQTT → EMQX</div>
    </div>
  </div>

  <div class="actions">
    <div class="pill">
      <span class="dot" id="dot"></span>
      <span id="statusTxt">Connecting...</span>
    </div>
  </div>
</header>

<!-- KPIs -->
<div class="grid">

  <div class="card kpi">
    <div class="label">Air Temperature</div>
    <div class="value"><span id="airT">--</span> <span class="unit">°C</span></div>
  </div>

  <div class="card kpi">
    <div class="label">Air Humidity</div>
    <div class="value"><span id="airRH">--</span> <span class="unit">%</span></div>
  </div>

  <div class="card kpi">
    <div class="label">Soil ADC</div>
    <div class="value"><span id="soil">--</span></div>
  </div>

  <div class="card kpi">
    <div class="label">Pump</div>
    <div class="value">
      <span id="pumpBadge" class="badge off">OFF</span>
    </div>
  </div>

</div>

<!-- Charts -->
<div class="charts">

  <div class="card chartCard">
    <canvas id="tempChart"></canvas>
  </div>

  <div class="card chartCard">
    <canvas id="soilChart"></canvas>
  </div>

</div>

</div>

<script src="app.js"></script>
</body>
</html>
