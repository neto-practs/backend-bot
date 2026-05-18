const { generarRespuestaUsuario } = require("./utils/dialogHelper");

// Códigos de color
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const RESET = "\x1b[0m";

let pasados = 0;
let fallados = 0;

console.log(`${BLUE}======================================================${RESET}`);
console.log(`${BLUE}🚀 INICIANDO MEGA-BATERÍA DE PRUEBAS DEL MOTOR NLU (40 TESTS)${RESET}`);
console.log(`${BLUE}======================================================${RESET}\n`);

function ejecutarPrueba(num, nombre, contextoFake, validacionFn) {
  try {
    const respuesta = generarRespuestaUsuario(contextoFake);
    
    if (validacionFn(respuesta)) {
      console.log(`${GREEN}✔ Test ${num} Pasado:${RESET} ${nombre}`);
      pasados++;
    } else {
      console.log(`${RED}❌ Test ${num} Fallado:${RESET} ${nombre}`);
      console.log(`   ${YELLOW}Contexto:${RESET}`, JSON.stringify(contextoFake));
      console.log(`   ${YELLOW}Respuesta obtenida:${RESET} "${respuesta}"\n`);
      fallados++;
    }
  } catch (error) {
    console.log(`${RED}💥 Error Crítico en Test ${num}:${RESET} ${nombre}`);
    console.error(error);
    fallados++;
  }
}

// Helper de validación rápida (comprueba si un string incluye al menos una de las palabras clave)
const contiene = (str, keywords) => keywords.some(kw => str.toLowerCase().includes(kw.toLowerCase()));
const contieneTodas = (str, keywords) => keywords.every(kw => str.toLowerCase().includes(kw.toLowerCase()));

// ==========================================
// 🧪 BLOQUE 1: FAST-TRACK (REFERENCIA OEM)
// ==========================================
console.log(`${MAGENTA}--- BLOQUE 1: REFERENCIAS OEM ---${RESET}`);
ejecutarPrueba(1, "Solo Referencia OEM", { articulo: null, marca: null, modelo: null, ano: null, version: null, referencia: "1J0941015" }, (res) => contiene(res, ["referencia", "directamente", "rápida"]));
ejecutarPrueba(2, "Referencia + Artículo", { articulo: "Faro", marca: null, modelo: null, ano: null, version: null, referencia: "OEM-999" }, (res) => contiene(res, ["referencia", "oem-999"]));
ejecutarPrueba(3, "Referencia lo anula todo", { articulo: "Motor", marca: "Audi", modelo: "A3", ano: "2010", version: "2.0", referencia: "REF-123" }, (res) => contiene(res, ["ref-123"]));
ejecutarPrueba(4, "Referencia con caracteres raros", { articulo: null, marca: null, modelo: null, ano: null, version: null, referencia: "X/Y-123.A" }, (res) => contiene(res, ["x/y-123.a"]));

// ==========================================
// 🧪 BLOQUE 2: AUSENCIA DE ARTÍCULO (EL INICIO)
// ==========================================
console.log(`\n${MAGENTA}--- BLOQUE 2: FALTA EL ARTÍCULO ---${RESET}`);
ejecutarPrueba(5, "Cliente dice 'Hola' (Todo nulo)", { articulo: null, marca: null, modelo: null, ano: null, version: null, referencia: null }, (res) => contiene(res, ["pieza", "recambio"]));
ejecutarPrueba(6, "Da la marca pero no la pieza", { articulo: null, marca: "Seat", modelo: null, ano: null, version: null, referencia: null }, (res) => contiene(res, ["pieza", "recambio"]));
ejecutarPrueba(7, "Da modelo pero no pieza", { articulo: null, marca: null, modelo: "Leon", ano: null, version: null, referencia: null }, (res) => contiene(res, ["pieza", "recambio"]));
ejecutarPrueba(8, "Da año pero no pieza", { articulo: null, marca: null, modelo: null, ano: "2015", version: null, referencia: null }, (res) => contiene(res, ["pieza", "recambio"]));
ejecutarPrueba(9, "Da versión pero no pieza", { articulo: null, marca: null, modelo: null, ano: null, version: "1.9 TDI", referencia: null }, (res) => contiene(res, ["pieza", "recambio"]));
ejecutarPrueba(10, "Da Marca, Modelo y Año pero falta pieza", { articulo: null, marca: "Audi", modelo: "A4", ano: "2020", version: null, referencia: null }, (res) => contiene(res, ["pieza", "recambio"]));

// ==========================================
// 🧪 BLOQUE 3: FALTA MARCA (CON MEMORIA EXTRA)
// ==========================================
console.log(`\n${MAGENTA}--- BLOQUE 3: FALTA LA MARCA ---${RESET}`);
ejecutarPrueba(11, "Solo da Artículo", { articulo: "Puerta", marca: null, modelo: null, ano: null, version: null, referencia: null }, (res) => contieneTodas(res, ["marca", "puerta"]));
ejecutarPrueba(12, "Artículo + Modelo (Falta Marca)", { articulo: "Faro", marca: null, modelo: "Golf", ano: null, version: null, referencia: null }, (res) => contieneTodas(res, ["marca", "faro", "golf"]));
ejecutarPrueba(13, "Artículo + Año (Falta Marca)", { articulo: "Volante", marca: null, modelo: null, ano: "2018", version: null, referencia: null }, (res) => contieneTodas(res, ["marca", "volante", "2018"]));
ejecutarPrueba(14, "Artículo + Versión (Falta Marca)", { articulo: "Caja de cambios", marca: null, modelo: null, ano: null, version: "6 velocidades", referencia: null }, (res) => contieneTodas(res, ["marca", "caja de cambios", "motor 6 velocidades"]));
ejecutarPrueba(15, "Artículo + Modelo + Año (Falta Marca)", { articulo: "Capó", marca: null, modelo: "Civic", ano: "2005", version: null, referencia: null }, (res) => contieneTodas(res, ["marca", "capó", "civic", "del 2005"]));

// ==========================================
// 🧪 BLOQUE 4: FALTA MODELO
// ==========================================
console.log(`\n${MAGENTA}--- BLOQUE 4: FALTA EL MODELO ---${RESET}`);
ejecutarPrueba(16, "Artículo + Marca", { articulo: "Asiento", marca: "Ford", modelo: null, ano: null, version: null, referencia: null }, (res) => contieneTodas(res, ["modelo", "asiento", "ford"]));
ejecutarPrueba(17, "Artículo + Marca + Año (Salta Modelo)", { articulo: "Retrovisor", marca: "Renault", modelo: null, ano: "2019", version: null, referencia: null }, (res) => contieneTodas(res, ["modelo", "retrovisor", "renault", "2019"]));
ejecutarPrueba(18, "Artículo + Marca + Versión (Salta Modelo)", { articulo: "Batería", marca: "Toyota", modelo: null, ano: null, version: "Híbrido", referencia: null }, (res) => contieneTodas(res, ["modelo", "batería", "toyota", "híbrido"]));
ejecutarPrueba(19, "Artículo + Marca + Año + Versión (Falta solo Modelo)", { articulo: "Filtro", marca: "Peugeot", modelo: null, ano: "2016", version: "HDI", referencia: null }, (res) => contieneTodas(res, ["modelo", "peugeot", "2016", "hdi"]));

// ==========================================
// 🧪 BLOQUE 5: FALTA AÑO
// ==========================================
console.log(`\n${MAGENTA}--- BLOQUE 5: FALTA EL AÑO ---${RESET}`);
ejecutarPrueba(20, "Artículo + Marca + Modelo", { articulo: "Neumático", marca: "BMW", modelo: "Serie 3", ano: null, version: null, referencia: null }, (res) => contieneTodas(res, ["año", "neumático", "bmw", "serie 3"]));
ejecutarPrueba(21, "Artículo + Marca + Modelo + Versión (Salta Año)", { articulo: "Llantas", marca: "Mercedes", modelo: "Clase A", ano: null, version: "AMG", referencia: null }, (res) => contieneTodas(res, ["año", "mercedes", "clase a"]));

// ==========================================
// 🧪 BLOQUE 6: FALTA VERSIÓN
// ==========================================
console.log(`\n${MAGENTA}--- BLOQUE 6: FALTA LA VERSIÓN ---${RESET}`);
ejecutarPrueba(22, "Tridente + Año (Falta Versión)", { articulo: "Motor", marca: "Nissan", modelo: "Qashqai", ano: "2020", version: null, referencia: null }, (res) => contiene(res, ["versión", "motor", "cilindrada"]));
ejecutarPrueba(23, "Artículo genérico + todo hasta Año", { articulo: "Pieza rara", marca: "Kia", modelo: "Sportage", ano: "2011", version: null, referencia: null }, (res) => contieneTodas(res, ["pieza rara", "kia", "sportage", "2011"]));

// ==========================================
// 🧪 BLOQUE 7: COMPLETO (ÉXITO TOTAL)
// ==========================================
console.log(`\n${MAGENTA}--- BLOQUE 7: BÚSQUEDA COMPLETADA ---${RESET}`);
ejecutarPrueba(24, "Flujo Completo Estandar", { articulo: "Faro", marca: "Seat", modelo: "Leon", ano: "2015", version: "1.9 TDI", referencia: null }, (res) => contieneTodas(res, ["resultados", "faro", "seat", "leon", "1.9 tdi", "2015"]));
ejecutarPrueba(25, "Completo con pieza larga", { articulo: "Bomba de inyección de combustible", marca: "Volkswagen", modelo: "Passat", ano: "2008", version: "2.0", referencia: null }, (res) => contieneTodas(res, ["resultados", "bomba de inyección", "passat"]));
ejecutarPrueba(26, "Completo con versión compleja", { articulo: "Cinturón", marca: "Volvo", modelo: "XC90", ano: "2022", version: "T8 Twin Engine Inscription", referencia: null }, (res) => contieneTodas(res, ["resultados", "volvo", "xc90", "twin engine"]));

// ==========================================
// 🧪 BLOQUE 8: CASOS EXTREMOS Y STRINGS VACÍOS
// ==========================================
console.log(`\n${MAGENTA}--- BLOQUE 8: CASOS LÍMITE (EDGE CASES) ---${RESET}`);
ejecutarPrueba(27, "Artículo vacío '' (Falsy)", { articulo: "", marca: null, modelo: null, ano: null, version: null, referencia: null }, (res) => contiene(res, ["pieza", "recambio"]));
ejecutarPrueba(28, "Marca vacía ''", { articulo: "Pomo", marca: "", modelo: null, ano: null, version: null, referencia: null }, (res) => contiene(res, ["marca"]));
ejecutarPrueba(29, "Años en texto raro", { articulo: "Luna", marca: "Dacia", modelo: "Sandero", ano: "dos mil veinte", version: null, referencia: null }, (res) => contieneTodas(res, ["versión", "dos mil veinte"]));
ejecutarPrueba(30, "Versión solo números", { articulo: "Radio", marca: "Mazda", modelo: "3", ano: "2014", version: "1.6", referencia: null }, (res) => contieneTodas(res, ["resultados", "1.6"]));

// ==========================================
// 🧪 BLOQUE 9: COMPROBANDO LA MEMORIA DE CONSTRUIR_EXTRA
// ==========================================
console.log(`\n${MAGENTA}--- BLOQUE 9: CONSTRUIR EXTRA (MEMORIA) ---${RESET}`);
ejecutarPrueba(31, "Memoria de Modelo", { articulo: "Espejo", marca: null, modelo: "Fiesta", ano: null, version: null, referencia: null }, (res) => contieneTodas(res, ["marca", "(fiesta)"]));
ejecutarPrueba(32, "Memoria de Año", { articulo: "Espejo", marca: null, modelo: null, ano: "2000", version: null, referencia: null }, (res) => contieneTodas(res, ["marca", "(del 2000)"]));
ejecutarPrueba(33, "Memoria de Versión", { articulo: "Espejo", marca: null, modelo: null, ano: null, version: "GTI", referencia: null }, (res) => contieneTodas(res, ["marca", "(motor gti)"]));
ejecutarPrueba(34, "Memoria Múltiple (Mod+Año)", { articulo: "Espejo", marca: null, modelo: "Ibiza", ano: "2010", version: null, referencia: null }, (res) => contieneTodas(res, ["marca", "(ibiza del 2010)"]));
ejecutarPrueba(35, "Memoria Múltiple (Año+Versión sin Marca ni Modelo)", { articulo: "Bujía", marca: null, modelo: null, ano: "1999", version: "16v", referencia: null }, (res) => contieneTodas(res, ["marca", "(del 1999 motor 16v)"]));

// ==========================================
// 🧪 BLOQUE 10: VARIACIONES ALEATORIAS DEL USUARIO
// ==========================================
console.log(`\n${MAGENTA}--- BLOQUE 10: RUIDO Y CASOS RAROS ---${RESET}`);
ejecutarPrueba(36, "Sin artículo, pero con todo lo demás", { articulo: null, marca: "Ferrari", modelo: "F40", ano: "1990", version: "V8", referencia: null }, (res) => contiene(res, ["pieza", "recambio"]));
ejecutarPrueba(37, "Artículo largo y raro", { articulo: "el pirulo ese que va debajo del motor", marca: "Lexus", modelo: "CT", ano: null, version: null, referencia: null }, (res) => contieneTodas(res, ["año", "pirulo"]));
ejecutarPrueba(38, "Referencia OEM con espacios", { articulo: null, marca: null, modelo: null, ano: null, version: null, referencia: "1J0 941 015 A" }, (res) => contiene(res, ["1j0 941 015 a"]));
ejecutarPrueba(39, "Usuario solo sabe que su coche es un 2.0", { articulo: null, marca: null, modelo: null, ano: null, version: "2.0", referencia: null }, (res) => contiene(res, ["pieza", "recambio"]));
ejecutarPrueba(40, "Tridente completo + Versión (sin Año)", { articulo: "Capota", marca: "Porsche", modelo: "911", ano: null, version: "Carrera", referencia: null }, (res) => contieneTodas(res, ["año", "porsche", "911"]));


// ==========================================
// 📊 RESULTADOS FINALES
// ==========================================
console.log(`\n${BLUE}======================================================${RESET}`);
console.log(`📊 RESULTADOS GLOBALES`);
console.log(`${GREEN}✅ Tests Exitosos: ${pasados} / 40${RESET}`);
if (fallados > 0) {
  console.log(`${RED}❌ Tests Fallados: ${fallados} / 40${RESET}`);
  console.log(`${YELLOW}Revisa los logs rojos de arriba para ver qué respuestas fallaron.${RESET}`);
} else {
  console.log(`${GREEN}🎉 ¡EL MOTOR NLU ES PERFECTO! La cascada funciona al 100% y cubre todas las posibilidades.${RESET}`);
}
console.log(`${BLUE}======================================================${RESET}\n`);