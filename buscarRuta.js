const axios = require('axios');

async function explorarJSON() {
  const url = "https://dev4premium.desguacesyrecambios.com/desguacesv8/api/recambios/piezas/";
  const query = "alternador audi allroad";

  console.log(`🕵️‍♂️ Buscando "${query}" en la API...`);

  try {
    const respuesta = await axios.get(url, {
      params: { locale: "es", q: query },
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const datos = respuesta.data;
    console.log("\n=== CLAVES PRINCIPALES DEL JSON ===");
    console.log(Object.keys(datos));

    // Búsqueda directa
    if (datos.anyosList) {
      console.log("\n'anyosList' ");
      console.log(datos.anyosList);
    } else if (datos.facets && datos.facets.anyosList) {
      console.log("\n'anyosList' está dentro de FACETS.");
      console.log(datos.facets.anyosList);
    } else {
      console.log("\n⚠️ No está a simple vista. Iniciando búsqueda profunda...");
      
      // Función recursiva para buscar la clave en cualquier parte del JSON
      let encontrado = false;
      const buscarClave = (obj, ruta = "datos") => {
        if (typeof obj === 'object' && obj !== null) {
          for (const [key, value] of Object.entries(obj)) {
            if (key === "anyosList" || key === "anyos") {
              console.log(`\n Encontrado en: ${ruta}.${key}`);
              console.log(value);
              encontrado = true;
            }
            buscarClave(value, `${ruta}.${key}`);
          }
        }
      };
      
      buscarClave(datos);
      if (!encontrado) console.log("❌ Definitivamente 'anyosList' no viene en este endpoint con esta búsqueda.");
    }

  } catch (error) {
    console.error("❌ Error conectando con la API:", error.message);
  }
}

explorarJSON();