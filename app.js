const RUTA_DATOS = "data/data_copernicus_sample.json";

fetch(RUTA_DATOS)
  .then(r => r.json())
  .then(datos => {
    crearKPIs(datos);
    crearMapa(datos);
    crearGrafico(datos);
  })
  .catch(err => console.error("Error cargando el JSON:", err));

function promedio(arr, campo) {
  return arr.reduce((s, d) => s + d[campo], 0) / arr.length;
}

function crearKPIs(datos) {
  const zonas = datos.filter(d => d.zona_acumulacion).length;
  const mayor = datos.reduce((a, b) => (b.indice_acumulacion > a.indice_acumulacion ? b : a));

  const kpis = [
    { titulo: "Total de pasadas", valor: datos.length },
    { titulo: "Nubosidad promedio", valor: promedio(datos, "nubosidad_pct").toFixed(1) + "%" },
    { titulo: "Aptitud promedio del sensor", valor: promedio(datos, "aptitud_sensor_pct").toFixed(1) + "%" },
    { titulo: "Zonas de acumulación", valor: zonas },
    { titulo: "Isla con mayor acumulación", valor: `${mayor.isla} (${mayor.indice_acumulacion})` }
  ];

  document.getElementById("kpis").innerHTML = kpis
    .map(k => `<div class="kpi"><div class="titulo">${k.titulo}</div><div class="valor">${k.valor}</div></div>`)
    .join("");
}

function crearMapa(datos) {
  const mapa = L.map("map");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
  }).addTo(mapa);

  const capaPasadas = L.layerGroup().addTo(mapa);
  const capaZonas = L.layerGroup().addTo(mapa);
  const puntos = [];

  datos.forEach(d => {
    const color = d.zona_acumulacion ? "#ef4444" : "#3b82f6";
    puntos.push([d.lat, d.lon]);

    if (d.zona_acumulacion) {
      L.circle([d.lat, d.lon], { radius: 15000, color, fillColor: color, fillOpacity: 0.2, weight: 1 }).addTo(capaZonas);
    }

    L.circleMarker([d.lat, d.lon], { radius: 8, color, fillColor: color, fillOpacity: 0.9 })
      .addTo(capaPasadas)
      .bindPopup(
        `<b>${d.isla}</b><br>Fecha: ${d.fecha}<br>Satélite: ${d.satelite}<br>` +
        `Nubosidad: ${d.nubosidad_pct}%<br>Aptitud: ${d.aptitud_sensor_pct}%<br>` +
        `Índice de acumulación: ${d.indice_acumulacion}`
      );
  });

  // Mapa de calor: la intensidad es el índice de acumulación (0 a 1)
  const capaCalor = L.heatLayer(
    datos.map(d => [d.lat, d.lon, d.indice_acumulacion / 100]),
    { radius: 35, blur: 25, minOpacity: 0.35 }
  ).addTo(mapa);

  L.control.layers(null, {
    "Pasadas satelitales": capaPasadas,
    "Zonas de acumulación": capaZonas,
    "Mapa de calor (índice)": capaCalor
  }, { collapsed: false }).addTo(mapa);

  mapa.fitBounds(puntos, { padding: [30, 30] });
}

function crearGrafico(datos) {
  const ordenados = [...datos].sort((a, b) => a.fecha.localeCompare(b.fecha));

  new Chart(document.getElementById("grafico"), {
    type: "line",
    data: {
      labels: ordenados.map(d => d.fecha),
      datasets: [
        { label: "Nubosidad (%)", data: ordenados.map(d => d.nubosidad_pct), borderColor: "#f59e0b", tension: 0.3 },
        { label: "Aptitud del sensor (%)", data: ordenados.map(d => d.aptitud_sensor_pct), borderColor: "#2fb5a5", tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 100, ticks: { color: "#e8eef7" } },
        x: { ticks: { color: "#e8eef7" } }
      },
      plugins: { legend: { labels: { color: "#e8eef7" } } }
    }
  });
}