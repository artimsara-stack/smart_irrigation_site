// 🔗 Firebase URL ديالك
const FIREBASE_URL =
  "https://smart-irrigation-site-90e51-default-rtdb.firebaseio.com/.json";

// جلب البيانات كل 3 ثواني
setInterval(fetchData, 3000);

function fetchData() {
  fetch(FIREBASE_URL)
    .then(response => response.json())
    .then(data => {
      if (!data) return;

      document.getElementById("air_temp").textContent =
        data.air_temp ?? "--";

      document.getElementById("air_rh").textContent =
        data.air_rh ?? "--";

      document.getElementById("soil").textContent =
        data.soil ?? "--";

      document.getElementById("lux").textContent =
        data.lux ?? "--";

      document.getElementById("ppfd").textContent =
        data.ppfd ?? "--";

      document.getElementById("pump").textContent =
        data.pump ?? "--";
    })
    .catch(err => console.error("Firebase error:", err));
}
