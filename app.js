const RUTA_DATOS = "data/data_copernicus_sample.json";
const APTITUD_CONFIABLE = 60; // desde este % el dato se considera confiable

Chart.defaults.color = "#cfe0f5";
Chart.defaults.borderColor = "rgba(255,255,255,0.08)";
Chart.defaults.font.family = "'Segoe UI', system-ui, Arial, sans-serif";

const ISLAS = {
  "Isabela": [-0.85, -91.1],
  "Fernandina": [-0.37, -91.55],
  "Santiago": [-0.23, -90.77],
  "Santa Cruz": [-0.63, -90.35],
  "Baltra": [-0.45, -90.28],
  "Floreana": [-1.29, -90.43],
  "San Cristóbal": [-0.85, -89.45],
  "Española": [-1.37, -89.68],
  "Genovesa": [0.32, -89.95]
};

let TODOS = [];
let mapa, capaPasadas, capaZonas, capaCalor;
let marcadores = {};
let graficoTendencia = null;
let graficoIslas = null;

fetch(RUTA_DATOS)
  .then(r => r.json())
  .then(datos => {
    TODOS = datos;
    iniciarFiltros();
    iniciarMapa();
    actualizar();
  })
  .catch(err => {
    console.error("Error cargando el JSON:", err);
    document.getElementById("kpis").innerHTML =
      `<div class="card vacio">No se pudieron cargar los datos: ${err.message}</div>`;
  });

/* ---------- Utilidades ---------- */
function promedio(arr, campo) {
  return arr.reduce((s, d) => s + d[campo], 0) / arr.length;
}

function animarNumeros() {
  document.querySelectorAll("[data-num]").forEach(el => {
    const fin = parseFloat(el.dataset.num);
    const dec = Number(el.dataset.dec || 0);
    const suf = el.dataset.suf || "";
    const t0 = performance.now();
    const dur = 900;
    function paso(t) {
      const p = Math.min((t - t0) / dur, 1);
      const suave = 1 - Math.pow(1 - p, 3);
      el.textContent = (fin * suave).toFixed(dec) + suf;
      if (p < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  });
}

/* ---------- Filtros ---------- */
function iniciarFiltros() {
  const sel = document.getElementById("f-isla");
  [...new Set(TODOS.map(d => d.isla))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .forEach(isla => sel.insertAdjacentHTML("beforeend", `<option value="${isla}">${isla}</option>`));

  ["f-isla", "f-aptitud", "f-zonas"].forEach(id =>
    document.getElementById(id).addEventListener("input", actualizar)
  );

  document.getElementById("f-reset").addEventListener("click", () => {
    document.getElementById("f-isla").value = "todas";
    document.getElementById("f-aptitud").value = 0;
    document.getElementById("f-zonas").checked = false;
    actualizar();
  });
}

function filtrar() {
  const isla = document.getElementById("f-isla").value;
  const minAptitud = Number(document.getElementById("f-aptitud").value);
  const soloZonas = document.getElementById("f-zonas").checked;
  document.getElementById("f-aptitud-val").textContent = minAptitud + "%";

  return TODOS.filter(d =>
    (isla === "todas" || d.isla === isla) &&
    d.aptitud_sensor_pct >= minAptitud &&
    (!soloZonas || d.zona_acumulacion)
  );
}

/* ---------- Actualización general ---------- */
function actualizar() {
  const datos = filtrar();
  if (!datos.length) {
    mostrarVacio();
    return;
  }
  crearKPIs(datos);
  actualizarMapa(datos);
  crearGraficos(datos);
  crearInsight(datos);
  crearTabla(datos);
}

function mostrarVacio() {
  document.getElementById("kpis").innerHTML =
    `<div class="card vacio">😕 No hay pasadas con estos filtros. Prueba bajar la aptitud mínima o limpiar los filtros.</div>`;
  capaPasadas.clearLayers();
  capaZonas.clearLayers();
  capaCalor.setLatLngs([]);
  marcadores = {};
  if (graficoTendencia) { graficoTendencia.destroy(); graficoTendencia = null; }
  if (graficoIslas) { graficoIslas.destroy(); graficoIslas = null; }
  document.getElementById("insight").innerHTML = "";
  document.getElementById("tabla-body").innerHTML = "";
}

/* ---------- KPIs ---------- */
function crearKPIs(datos) {
  const zonas = datos.filter(d => d.zona_acumulacion).length;
  const mayor = datos.reduce((a, b) => (b.indice_acumulacion > a.indice_acumulacion ? b : a));

  const kpis = [
    { icono: "🛰️", titulo: "Pasadas del satélite", num: datos.length, dec: 0, suf: "", color: "#3b82f6",
      ayuda: "Veces que el satélite pasó y tomó datos" },
    { icono: "☁️", titulo: "Nubosidad promedio", num: promedio(datos, "nubosidad_pct"), dec: 1, suf: "%", color: "#f59e0b",
      ayuda: "Porcentaje medio del cielo tapado por nubes" },
    { icono: "📡", titulo: "Aptitud del sensor", num: promedio(datos, "aptitud_sensor_pct"), dec: 1, suf: "%", color: "#2fb5a5",
      ayuda: "Qué tan utilizable fue la captura, en promedio" },
    { icono: "🚨", titulo: "Zonas críticas", num: zonas, dec: 0, suf: "", color: "#ef4444",
      ayuda: "Pasadas con índice de acumulación ≥ 60" },
    { icono: "📍", titulo: "Isla más afectada",
      texto: `${mayor.isla} <small>(${mayor.indice_acumulacion})</small>`, color: "#a78bfa",
      ayuda: "Isla con el mayor índice de acumulación" }
  ];

  document.getElementById("kpis").innerHTML = kpis.map(k => `
    <div class="kpi" style="--acento:${k.color}">
      <div class="kpi-icono">${k.icono}</div>
      <div class="kpi-info">
        <div class="titulo">${k.titulo}</div>
        ${k.texto
          ? `<div class="valor texto">${k.texto}</div>`
          : `<div class="valor" data-num="${k.num}" data-dec="${k.dec}" data-suf="${k.suf}">0</div>`}
        <div class="ayuda">${k.ayuda}</div>
      </div>
    </div>`).join("");

  animarNumeros();
}

/* ---------- Mapa ---------- */
function iniciarMapa() {
  mapa = L.map("map", { scrollWheelZoom: false, zoomSnap: 0.25 });
  mapa.setView([-0.7, -90.6], 8);

  const satelite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Imágenes © Esri, Maxar, Earthstar Geographics y la comunidad GIS", maxZoom: 17 }
  );
  const claro = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
  });
  const oscuro = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 19
  });
  satelite.addTo(mapa);

  capaPasadas = L.layerGroup().addTo(mapa);
  capaZonas = L.layerGroup().addTo(mapa);
  capaCalor = L.heatLayer([], {
    radius: 38, blur: 28, minOpacity: 0.4,
    gradient: { 0.2: "#3b82f6", 0.45: "#22d3ee", 0.65: "#facc15", 0.85: "#f97316", 1: "#ef4444" }
  }).addTo(mapa);

  const capaNombres = L.layerGroup().addTo(mapa);
  Object.entries(ISLAS).forEach(([nombre, [lat, lon]]) => {
    L.marker([lat, lon], { opacity: 0, interactive: false })
      .bindTooltip(nombre, { permanent: true, direction: "center", className: "etiqueta-isla" })
      .addTo(capaNombres);
  });

  L.control.scale({ imperial: false }).addTo(mapa);

  L.control.layers(
    { "🛰️ Satélite": satelite, "🗺️ Mapa claro": claro, "🌑 Mapa oscuro": oscuro },
    {
      "🏝️ Nombres de islas": capaNombres,
      "📍 Pasadas satelitales": capaPasadas,
      "🚨 Zonas de acumulación": capaZonas,
      "🔥 Mapa de calor (índice)": capaCalor
    },
    { collapsed: false }
  ).addTo(mapa);
}

function actualizarMapa(datos) {
  capaPasadas.clearLayers();
  capaZonas.clearLayers();
  marcadores = {};

  datos.forEach(d => {
    const critica = d.zona_acumulacion;
    const color = critica ? "#ef4444" : "#3b82f6";

    if (critica) {
      L.circle([d.lat, d.lon], { radius: 15000, color, fillColor: color, fillOpacity: 0.18, weight: 1 })
        .addTo(capaZonas);
    }

    const marcador = critica
      ? L.marker([d.lat, d.lon], {
          icon: L.divIcon({ className: "pulso-wrap", html: '<span class="pulso"></span>', iconSize: [16, 16] })
        })
      : L.circleMarker([d.lat, d.lon], { radius: 8, color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 0.95 });

    marcador
      .addTo(capaPasadas)
      .bindPopup(
        `<b>${d.isla}</b> · ${critica ? "🔴 Zona crítica" : "🔵 Normal"}<br>` +
        `📅 ${d.fecha} · 🛰️ ${d.satelite}<br>` +
        `☁️ Nubosidad: ${d.nubosidad_pct}%<br>` +
        `📡 Aptitud: ${d.aptitud_sensor_pct}%<br>` +
        `🧪 Índice de acumulación: <b>${d.indice_acumulacion}</b>`
      );

    marcadores[d.id] = marcador;
  });

  capaCalor.setLatLngs(datos.map(d => [d.lat, d.lon, d.indice_acumulacion / 100]));
  mapa.fitBounds(datos.map(d => [d.lat, d.lon]), { padding: [40, 40], maxZoom: 9 });
}

function irAPunto(id) {
  const m = marcadores[id];
  if (!m) return;
  document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" });
  mapa.flyTo(m.getLatLng(), 11, { duration: 1.2 });
  setTimeout(() => m.openPopup(), 1300);
}

/* ---------- Gráficos ---------- */
function crearGraficos(datos) {
  // 1. Tendencia por fecha
  const ordenados = [...datos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (graficoTendencia) graficoTendencia.destroy();

  graficoTendencia = new Chart(document.getElementById("grafico"), {
    type: "bar",
    data: {
      labels: ordenados.map(d => d.fecha.slice(5)),
      datasets: [
        {
          type: "bar", label: "Índice de acumulación", data: ordenados.map(d => d.indice_acumulacion),
          backgroundColor: "rgba(167,139,250,0.45)", borderRadius: 4, order: 2
        },
        {
          type: "line", label: "Nubosidad (%)", data: ordenados.map(d => d.nubosidad_pct),
          borderColor: "#f59e0b", backgroundColor: "#f59e0b", tension: 0.35, pointRadius: 3, order: 1
        },
        {
          type: "line", label: "Aptitud del sensor (%)", data: ordenados.map(d => d.aptitud_sensor_pct),
          borderColor: "#2fb5a5", backgroundColor: "#2fb5a5", tension: 0.35, pointRadius: 3, order: 1
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { min: 0, max: 100 },
        x: { ticks: { maxRotation: 60, minRotation: 45 } }
      },
      plugins: { legend: { position: "bottom" } }
    }
  });

  // 2. Índice máximo por isla
  const porIsla = {};
  datos.forEach(d => { porIsla[d.isla] = Math.max(porIsla[d.isla] || 0, d.indice_acumulacion); });
  const lista = Object.entries(porIsla).sort((a, b) => b[1] - a[1]);
  if (graficoIslas) graficoIslas.destroy();

  graficoIslas = new Chart(document.getElementById("graficoIslas"), {
    type: "bar",
    data: {
      labels: lista.map(([isla]) => isla),
      datasets: [{
        label: "Índice máximo",
        data: lista.map(([, v]) => v),
        backgroundColor: lista.map(([, v]) => (v >= 60 ? "rgba(239,68,68,0.75)" : "rgba(59,130,246,0.7)")),
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      scales: { x: { min: 0, max: 100 } },
      plugins: { legend: { display: false } }
    }
  });
}

/* ---------- Conclusión automática ---------- */
function crearInsight(datos) {
  const mayor = datos.reduce((a, b) => (b.indice_acumulacion > a.indice_acumulacion ? b : a));
  const mejor = datos.reduce((a, b) => (b.aptitud_sensor_pct > a.aptitud_sensor_pct ? b : a));
  const criticas = datos.filter(d => d.zona_acumulacion);
  const fiables = criticas.filter(d => d.aptitud_sensor_pct >= APTITUD_CONFIABLE);

  document.getElementById("insight").innerHTML = `
    <h2>💡 ¿Qué nos dice esto?</h2>
    Con los filtros actuales hay <b>${datos.length}</b> pasadas. De ellas, <b>${criticas.length}</b> detectan
    zonas críticas y <b>${fiables.length}</b> tienen datos confiables (aptitud ≥ ${APTITUD_CONFIABLE}%), así que
    ahí se puede decidir con seguridad. La isla más afectada es <b>${mayor.isla}</b> (índice ${mayor.indice_acumulacion}).
    La captura más limpia fue el <b>${mejor.fecha}</b> en ${mejor.isla}, con solo ${mejor.nubosidad_pct}% de nubosidad.`;
}

/* ---------- Tabla ---------- */
function crearTabla(datos) {
  const top = [...datos].sort((a, b) => b.indice_acumulacion - a.indice_acumulacion).slice(0, 8);
  const cuerpo = document.getElementById("tabla-body");

  cuerpo.innerHTML = top.map((d, i) => {
    const color = d.zona_acumulacion ? "#ef4444" : "#3b82f6";
    const fiable = d.aptitud_sensor_pct >= APTITUD_CONFIABLE;
    return `
      <tr data-id="${d.id}">
        <td>${i + 1}</td>
        <td><b>${d.isla}</b></td>
        <td>${d.fecha}</td>
        <td><span class="barra"><span style="width:${d.indice_acumulacion}%;background:${color}"></span></span>${d.indice_acumulacion}</td>
        <td><span class="tag ${d.zona_acumulacion ? "rojo" : "azul"}">${d.zona_acumulacion ? "Crítica" : "Normal"}</span></td>
        <td>${d.aptitud_sensor_pct}%</td>
        <td>${fiable ? "✅ Confiable" : "⚠️ Poco confiable"}</td>
      </tr>`;
  }).join("");

  cuerpo.querySelectorAll("tr").forEach(tr =>
    tr.addEventListener("click", () => irAPunto(Number(tr.dataset.id)))
  );
}