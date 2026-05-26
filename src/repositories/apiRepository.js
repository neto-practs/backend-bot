const axios = require("axios");
const logger = require("../utils/logger");
const { ESTADOS_CIRCUITO } = require("../config/constants");

// Variables del Circuit Breaker (Evita saturar la API si se cae)
let estadoCircuito = ESTADOS_CIRCUITO.CERRADO;
let fallosConsecutivos = 0;
let tiempoBloqueoHasta = 0;

const UMBRAL_FALLOS = Number(process.env.CB_Umbral) || 5; 
const TIEMPO_RESETEO = Number(process.env.CB_Reset) || 60000;
// Timeout para la consulta de sugerencias. Se lee del .env al arrancar el servidor.
// Cualquier rescalado respetará el valor configurado en el entorno.
const SUGERENCIAS_TIMEOUT_MS = Number(process.env.SUGERENCIAS_TIMEOUT) || 15000;

/**
 * Consulta la base de datos de piezas de un cliente específico.
 * * @param {Object} parametrosBusqueda - Filtros de la pieza (q: "alternador bmw", etc.)
 * @param {string} reqId - ID de trazabilidad para los logs
 * @param {Object} cliente - Objeto con la config del cliente (storeUrl, etc.)
 * @param {number} maxIntentos - Número máximo de reintentos antes de fallar
 */
const consultarAPI = async (parametrosBusqueda, reqId, cliente, maxIntentos = 3) => {
  if (!cliente || !cliente.storeUrl) {
    logger.error({ reqId }, "Falta la configuracion del cliente en apiRepository/{consultarAPI}");
    throw new Error("Error de configuracion del cliente");
  }

  //Construimos URL dinámica en la tienda del cliente actual
  const urlDelCliente = `${cliente.storeUrl}/desguacesv8/api/recambios/piezas/`;

  console.log("==================================================");
  console.log("URL QUE ESTÁ USANDO EL BOT:", urlDelCliente);
  console.log("==================================================");

  //Control del Circuito: Si está abierto, bloqueamos las peticiones de raíz
  if (estadoCircuito === ESTADOS_CIRCUITO.ABIERTO) {
    if (Date.now() < tiempoBloqueoHasta) {
      logger.error({ reqId, url: urlDelCliente }, "Circuito abierto, peticion rechazada para evitar saturacion.");
      throw new Error("Servicio en mantenimiento");
    } 
    estadoCircuito = ESTADOS_CIRCUITO.SEMI_ABIERTO;
    logger.warn({ reqId }, "Modo SEMI-ABIERTO: Probando si la API ha vuelto a la vida");
  }

  const baseMs = 500;

  //Bucle de reintentos en caso de que la red falle puntualmente
  for (let i = 1; i <= maxIntentos; i++) {
    const inicio = Date.now();

    try {
      logger.info({ reqId }, `Lanzando peticion a la API (Intento ${i}/${maxIntentos}) -> Query: "${parametrosBusqueda.q || 'vacia'}"`);

      const respuesta = await axios.get(urlDelCliente, {
        params: {
          locale: "es",
          ...parametrosBusqueda,
        },
        timeout: Number(process.env.API_TIMEOUT) || 5000,
      });

      // Si la API responde, pero va lenta, informamos
      const duracion = Date.now() - inicio;
      if (duracion > 3000) {
        logger.warn({ reqId, url: urlDelCliente }, `API lenta: ${duracion}ms`);
      }
      
      // La API funciona bien => reseteamos los contadores de fallos
      fallosConsecutivos = 0;
      estadoCircuito = ESTADOS_CIRCUITO.CERRADO;

      return respuesta.data;

    } catch (error) {
      const esUltimoIntento = (i === maxIntentos);
      logger.error({ reqId, url: urlDelCliente }, `Error en intento ${i}: ${error.message}`);

      // Si ya hemos gastado todas las oportunidsdes, activamos la alarma
      if (esUltimoIntento) {
        manejarFracaso();
        throw new Error("Servicio temporalmente no disponible");
      }
      
      // Backoff Exponencial: El tiempo de espera se duplica por cada fallo (500ms, 1000ms, 2000ms...)
      const delay = baseMs * Math.pow(2, i - 1);
      logger.info({ reqId }, `Reintentando en ${delay}ms...`);
      await esperar(delay);
    }
  }
};

// Sube el contador de fallos y abre el circuito si superamos el límite
function manejarFracaso() {
  fallosConsecutivos++;
  if (fallosConsecutivos >= UMBRAL_FALLOS) {
    estadoCircuito = ESTADOS_CIRCUITO.ABIERTO;
    tiempoBloqueoHasta = Date.now() + TIEMPO_RESETEO;
    logger.error(`¡CIRCUITO ACTIVADO! API bloqueada por ${TIEMPO_RESETEO / 1000}s.`);
  }
}

// Función auxiliar para pausar la ejecución del código
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mapa: campo de la cascada del bot → campo real en la respuesta de la API.
 * "ano" es null porque el año NO existe como campo directo — se extrae de la URL.
 */
const CAMPO_API = {
  articulo: "articulo",
  marca:    "marca",
  modelo:   "modelo",
  version:  "version",
  ano:      null, // Extraído de pieza.url (ej: "...audi-a6-2002-2003-2004-...")
};

/**
 * Extrae años de 4 dígitos presentes en la URL o alt de una pieza.
 * La API incluye los años de compatibilidad dentro del slug de la URL.
 * Ej: "alternador-audi-a6-2002-2003-2004-9145437" → ["2002", "2003", "2004"]
 */
const extraerAnosDePieza = (pieza) => {
  const texto = pieza.url || pieza.alt || "";
  const matches = texto.match(/\b(19|20)\d{2}\b/g);
  return matches ? [...new Set(matches)] : [];
};

/**
 * Consulta la API para obtener sugerencias del siguiente campo vacío en la cascada.
 * Cubre: articulo, marca, modelo, version (campo directo) y ano (extraído de URL).
 *
 * @param {Object} busquedaBD    - Contexto actual {articulo, marca, modelo, ano, version}
 * @param {string} campoFaltante - Campo que necesita sugerencias
 * @param {Object} cliente       - Config del cliente (storeUrl)
 */
const obtenerSugerencias = async (busquedaBD, campoFaltante, cliente) => {
  if (!cliente || !cliente.storeUrl) return [];

  // Validamos que el campo pedido es de la cascada
  if (!CAMPO_API.hasOwnProperty(campoFaltante)) {
    logger.warn(`[Sugerencias] Campo desconocido: '${campoFaltante}'`);
    return [];
  }

  // Construimos la query con los datos ya conocidos para filtrar las sugerencias
  const partesBusqueda = [
    busquedaBD.articulo,
    busquedaBD.marca,
    busquedaBD.modelo,
    busquedaBD.ano,
    busquedaBD.version
  ].filter(val => val && val !== "null" && val.trim() !== "");

  // Si el usuario pide ayuda desde el principio (contexto vacío), damos opciones populares
  if (partesBusqueda.length === 0) {
    if (campoFaltante === "articulo") {
      return ["Motor", "Alternador", "Faro", "Caja de cambios", "Paragolpes", "Aleta", "Capó", "Retrovisor"];
    } else if (campoFaltante === "marca") {
      return ["Audi", "BMW", "Mercedes-Benz", "Seat", "Volkswagen", "Renault", "Peugeot", "Ford"];
    }
    return [];
  }

  const query = partesBusqueda.join(" ");

  try {
    const urlDelCliente = `${cliente.storeUrl}/desguacesv8/api/recambios/piezas/`;

    logger.info(`[Sugerencias] Campo '${campoFaltante}' | query: "${query}" | timeout: ${SUGERENCIAS_TIMEOUT_MS}ms`);

    const respuesta = await axios.get(urlDelCliente, {
      params: { locale: "es", q: query, limit: 40 }, // Reducido a 40 para evitar timeouts
      timeout: SUGERENCIAS_TIMEOUT_MS
    });

    const piezas = respuesta.data.piezas || [];

    logger.info(`[Sugerencias] API respondió con ${piezas.length} piezas para query "${query}"`);

    if (piezas.length === 0) {
      return [];
    }

    let opcionesUnicas;

    if (campoFaltante === "ano") {
      const todosLosAnos = piezas.flatMap(extraerAnosDePieza);
      opcionesUnicas = [...new Set(todosLosAnos)].sort().slice(0, 10);
    } else {
      const campoReal = CAMPO_API[campoFaltante];
      const opciones = piezas
        .map(p => p[campoReal])
        .filter(val => val && String(val).trim() !== "" && val !== "SIN DEFINIR");
      
      // Limpieza de duplicados ignorando mayúsculas/minúsculas pero preservando formato original
      const mapaOpciones = new Map();
      opciones.forEach(opt => {
        const key = String(opt).trim().toLowerCase();
        if (!mapaOpciones.has(key)) {
          mapaOpciones.set(key, String(opt).trim());
        }
      });
      
      opcionesUnicas = Array.from(mapaOpciones.values()).slice(0, 10);
    }

    logger.info(`[Sugerencias] ✅ ${opcionesUnicas.length} opciones encontradas para '${campoFaltante}': [${opcionesUnicas.join(", ")}]`);
    return opcionesUnicas;

  } catch (error) {
    logger.warn(`[Sugerencias] Falló silenciosamente para '${campoFaltante}': ${error.message}`);
    return [];
  }
};

module.exports = { consultarAPI, obtenerSugerencias };
