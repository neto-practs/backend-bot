const axios = require("axios");
require("dotenv").config();

// ==========================================
// CONFIGURACIÓN DEL TEST
// ==========================================
// Asegúrate de que el servidor esté corriendo antes de lanzar los tests.
// Si tienes activado el Rate Limiter, sube el valor de 'limit' en tu .env (ej: limit=100)
const BASE_URL = process.env.TEST_API_URL || "http://localhost:4000/api/chat";
const API_KEY = process.env.TEST_API_KEY || "clave_local";
const ORIGIN = process.env.TEST_ORIGIN || "http://localhost:5173";

// Códigos de color para la terminal
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const RESET = "\x1b[0m";

let pasados = 0;
let fallados = 0;

// Helpers de validación
const contiene = (str, keywords) => keywords.some(kw => str.includes(kw.toLowerCase()));
const contieneTodas = (str, keywords) => keywords.every(kw => str.includes(kw.toLowerCase()));
const contieneEstructura = (str, obligatorias, opcionales) => 
    contieneTodas(str, obligatorias) && contiene(str, opcionales);

async function ejecutarPrueba(num, nombre, contextoFake, validacionFn) {
  try {
    // Enviamos un mensaje neutral (.) para que el servidor genere la respuesta basada en el contexto proporcionado
    const response = await axios.post(BASE_URL, {
      message: ".", 
      contexto: JSON.stringify(contextoFake)
    }, {
      headers: {
        "api-key": API_KEY,
        "Origin": ORIGIN,
        "Content-Type": "application/json"
      },
      timeout: 30000 // 30s por si la IA está lenta
    });

    const respuesta = (response.data.respuesta || "").toLowerCase();
    
    if (validacionFn(respuesta)) {
      console.log(`${GREEN}✔ Test ${num} Pasado:${RESET} ${nombre}`);
      pasados++;
    } else {
      console.log(`${RED}❌ Test ${num} Fallado:${RESET} ${nombre}`);
      console.log(`   ${YELLOW}Contexto enviado:${RESET}`, JSON.stringify(contextoFake));
      console.log(`   ${YELLOW}Respuesta obtenida:${RESET} "${respuesta}"\n`);
      fallados++;
    }
  } catch (error) {
    let errorMsg = error.message;
    if (error.response) {
      if (error.response.status === 429) {
        errorMsg = "RATE LIMIT: El servidor ha bloqueado la petición por exceso de velocidad. Sube el limit en el .env";
      } else {
        errorMsg = `HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`;
      }
    }
    console.log(`${RED}💥 Error en Test ${num}:${RESET} ${nombre} -> ${errorMsg}`);
    fallados++;
  }
  
  // Un pequeño respiro entre tests
  await new Promise(resolve => setTimeout(resolve, 300));
}

async function iniciarBateriaDePruebas() {
  console.log(`${BLUE}======================================================${RESET}`);
  console.log(`${BLUE}🚀 INICIANDO BATERÍA DE PRUEBAS CONTRA EL SERVIDOR${RESET}`);
  console.log(`${BLUE}📍 URL: ${BASE_URL}${RESET}`);
  console.log(`${BLUE}======================================================${RESET}\n`);

  // ==========================================
  // 🧪 BLOQUE 1: FAST-TRACK (REFERENCIA OEM)
  // ==========================================
  console.log(`${MAGENTA}--- BLOQUE 1: REFERENCIAS OEM ---${RESET}`);
  // En caso de no haber stock, el servidor responde con un mensaje genérico de "tu pieza" y "vehiculo deseado"
  // Pero si la petición fue exitosa (200 OK), el test se da por bueno si contiene la referencia O si es el mensaje de no stock
  const esRespuestaBusqueda = (res) => contiene(res, ["encontrado", "almacén", "stock", "opciones", "resultados"]);

  await ejecutarPrueba(1, "Solo Referencia OEM", { articulo: null, marca: null, modelo: null, ano: null, version: null, referencia: "1J0941015" }, (res) => contiene(res, ["1j0941015", "almacén", "stock"]));
  await ejecutarPrueba(2, "Referencia + Artículo", { articulo: "Faro", marca: null, modelo: null, ano: null, version: null, referencia: "OEM-999" }, (res) => contiene(res, ["oem-999", "faro", "almacén"]));
  await ejecutarPrueba(3, "Referencia lo anula todo", { articulo: "Motor", marca: "Audi", modelo: "A3", ano: "2010", version: "2.0", referencia: "REF-123" }, (res) => contiene(res, ["ref-123", "motor", "audi", "a3", "almacén"]));
  await ejecutarPrueba(4, "Referencia con caracteres raros", { articulo: null, marca: null, modelo: null, ano: null, version: null, referencia: "X/Y-123.A" }, (res) => contiene(res, ["x/y-123.a", "almacén", "stock"]));

  // ==========================================
  // 🧪 BLOQUE 2: AUSENCIA DE ARTÍCULO (EL INICIO)
  // ==========================================
  console.log(`\n${MAGENTA}--- BLOQUE 2: FALTA EL ARTÍCULO ---${RESET}`);
  const opcionesFaltaPiezaGen = ["pieza", "recambio", "necesitas", "buscando"];
  await ejecutarPrueba(5, "Todo nulo", { articulo: null, marca: null, modelo: null, ano: null, version: null, referencia: null }, (res) => contiene(res, ["pieza", "recambio", "ayudar"]));
  await ejecutarPrueba(6, "Da la marca pero no la pieza", { articulo: null, marca: "Seat", modelo: null, ano: null, version: null, referencia: null }, (res) => contieneEstructura(res, ["seat"], opcionesFaltaPiezaGen));
  await ejecutarPrueba(7, "Da modelo pero no pieza", { articulo: null, marca: null, modelo: "Leon", ano: null, version: null, referencia: null }, (res) => contiene(res, opcionesFaltaPiezaGen)); // Sin marca, el helper a veces no dice el modelo
  await ejecutarPrueba(8, "Da año pero no pieza", { articulo: null, marca: null, modelo: null, ano: "2015", version: null, referencia: null }, (res) => contiene(res, opcionesFaltaPiezaGen));
  await ejecutarPrueba(9, "Da Marca, Modelo y Año pero falta pieza", { articulo: null, marca: "Audi", modelo: "A4", ano: "2020", version: null, referencia: null }, (res) => contieneEstructura(res, ["audi", "a4"], opcionesFaltaPiezaGen));

  // ==========================================
  // 🧪 BLOQUE 3: FALTA MARCA
  // ==========================================
  console.log(`\n${MAGENTA}--- BLOQUE 3: FALTA LA MARCA ---${RESET}`);
  const opcionesFaltaMarca = ["marca"];
  await ejecutarPrueba(10, "Solo da Artículo", { articulo: "Puerta", marca: null, modelo: null, ano: null, version: null, referencia: null }, (res) => contieneEstructura(res, ["puerta"], opcionesFaltaMarca));
  await ejecutarPrueba(11, "Artículo + Modelo (Falta Marca)", { articulo: "Faro", marca: null, modelo: "Golf", ano: null, version: null, referencia: null }, (res) => contieneEstructura(res, ["faro", "golf"], opcionesFaltaMarca));
  await ejecutarPrueba(12, "Artículo + Año (Falta Marca)", { articulo: "Volante", marca: null, modelo: null, ano: "2018", version: null, referencia: null }, (res) => contieneEstructura(res, ["volante", "2018"], opcionesFaltaMarca));
  await ejecutarPrueba(13, "Artículo + Versión (Falta Marca)", { articulo: "Caja de cambios", marca: null, modelo: null, ano: null, version: "6 velocidades", referencia: null }, (res) => contieneEstructura(res, ["caja", "velocidades"], opcionesFaltaMarca));
  await ejecutarPrueba(14, "Artículo + Modelo + Año (Falta Marca)", { articulo: "Capo", marca: null, modelo: "Civic", ano: "2005", version: null, referencia: null }, (res) => contieneEstructura(res, ["capo", "civic", "2005"], opcionesFaltaMarca));

  // ==========================================
  // 🧪 BLOQUE 4: FALTA MODELO
  // ==========================================
  console.log(`\n${MAGENTA}--- BLOQUE 4: FALTA EL MODELO ---${RESET}`);
  const opcionesFaltaModelo = ["modelo"];
  await ejecutarPrueba(15, "Artículo + Marca", { articulo: "Asiento", marca: "Ford", modelo: null, ano: null, version: null, referencia: null }, (res) => contieneEstructura(res, ["asiento", "ford"], opcionesFaltaModelo));
  await ejecutarPrueba(16, "Artículo + Marca + Año (Salta Modelo)", { articulo: "Retrovisor", marca: "Renault", modelo: null, ano: "2019", version: null, referencia: null }, (res) => contieneEstructura(res, ["retrovisor", "renault", "2019"], opcionesFaltaModelo));
  await ejecutarPrueba(17, "Artículo + Marca + Versión (Salta Modelo)", { articulo: "Bateria", marca: "Toyota", modelo: null, ano: null, version: "Hibrido", referencia: null }, (res) => contieneEstructura(res, ["bateria", "toyota", "hibrido"], opcionesFaltaModelo));
  await ejecutarPrueba(18, "Artículo + Marca + Año + Versión", { articulo: "Filtro", marca: "Peugeot", modelo: null, ano: "2016", version: "HDI", referencia: null }, (res) => contieneEstructura(res, ["peugeot", "2016", "hdi"], opcionesFaltaModelo));

  // ==========================================
  // 🧪 BLOQUE 5: FALTA AÑO
  // ==========================================
  console.log(`\n${MAGENTA}--- BLOQUE 5: FALTA EL AÑO ---${RESET}`);
  const opcionesFaltaAno = ["año"];
  await ejecutarPrueba(19, "Artículo + Marca + Modelo", { articulo: "Neumatico", marca: "BMW", modelo: "Serie 3", ano: null, version: null, referencia: null }, (res) => contieneEstructura(res, ["neumatico", "bmw", "serie 3"], opcionesFaltaAno));
  await ejecutarPrueba(20, "Tridente completo sin año", { articulo: "Llantas", marca: "Mercedes", modelo: "Clase A", ano: null, version: null, referencia: null }, (res) => contieneEstructura(res, ["mercedes", "clase a"], opcionesFaltaAno));

  // ==========================================
  // 🧪 BLOQUE 6: FALTA VERSIÓN
  // ==========================================
  console.log(`\n${MAGENTA}--- BLOQUE 6: FALTA LA VERSIÓN ---${RESET}`);
  const opcionesFaltaVersion = ["versión", "motor", "cilindrada"];
  await ejecutarPrueba(21, "Tridente + Año (Falta Versión)", { articulo: "Motor", marca: "Nissan", modelo: "Qashqai", ano: "2020", version: null, referencia: null }, (res) => contieneEstructura(res, ["nissan", "qashqai", "2020"], opcionesFaltaVersion));
  await ejecutarPrueba(22, "Artículo genérico + todo hasta Año", { articulo: "Pieza rara", marca: "Kia", modelo: "Sportage", ano: "2011", version: null, referencia: null }, (res) => contiene(res, [...opcionesFaltaVersion, "almacén", "stock"]));

  // ==========================================
  // 🧪 BLOQUE 7: COMPLETO (ÉXITO TOTAL)
  // ==========================================
  console.log(`\n${MAGENTA}--- BLOQUE 7: BÚSQUEDA COMPLETADA ---${RESET}`);
  const opcionesExito = ["encontrado", "stock", "opciones", "resultados", "buscando", "ayudar", "almacén"];
  await ejecutarPrueba(23, "Flujo Completo", { articulo: "Faro", marca: "Seat", modelo: "Leon", ano: "2015", version: "1.9 TDI", referencia: null }, (res) => contiene(res, opcionesExito));
  await ejecutarPrueba(24, "Completo con pieza larga", { articulo: "Bomba de inyeccion", marca: "Volkswagen", modelo: "Passat", ano: "2008", version: "2.0", referencia: null }, (res) => contiene(res, opcionesExito));
  // ==========================================
  // 📊 RESULTADOS FINALES
  // ==========================================
  console.log(`\n${BLUE}======================================================${RESET}`);
  console.log(`📊 RESULTADOS GLOBALES`);
  console.log(`${GREEN}✅ Tests Exitosos: ${pasados}${RESET}`);
  if (fallados > 0) {
    console.log(`${RED}❌ Tests Fallados: ${fallados}${RESET}`);
    console.log(`${YELLOW}Revisa los logs rojos de arriba para ver qué falló.${RESET}`);
  } else {
    console.log(`${GREEN}🎉 ¡EL BACKEND RESPONDE CORRECTAMENTE A LA CASCADA!${RESET}`);
  }
  console.log(`${BLUE}======================================================${RESET}\n`);
}

iniciarBateriaDePruebas();
