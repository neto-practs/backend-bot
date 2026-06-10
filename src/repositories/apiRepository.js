const axios = require("axios");
const logger = require("../utils/logger");
const { ESTADOS_CIRCUITO } = require("../config/constants");

// Circuit Breaker: evita saturar la API externa si falla repetidamente.
let estadoCircuito = ESTADOS_CIRCUITO.CERRADO;
let fallosConsecutivos = 0;
let tiempoBloqueoHasta = 0;

const UMBRAL_FALLOS = Number(process.env.CB_Umbral) || 5;
const TIEMPO_RESETEO = Number(process.env.CB_Reset) || 60000;
const DEFAULT_SUGERENCIAS_TIMEOUT = Number(process.env.SUGERENCIAS_TIMEOUT_MS) || 15000;
const DEFAULT_API_TIMEOUT = Number(process.env.API_TIMEOUT_MS) || 10000;

/**
 * Consulta la base de datos de piezas de un cliente específico.
 * @param {Object} parametrosBusqueda - Filtros de la pieza (q: "alternador bmw", etc.)
 * @param {string} reqId - ID de trazabilidad para los logs
 * @param {Object} cliente - Objeto con la config del cliente
 * @param {number} maxIntentos - Número máximo de reintentos
 */
const consultarAPI = async (parametrosBusqueda, reqId, cliente, maxIntentos = 3) => {
  if (!cliente || !cliente.storeUrl) {
    logger.error({ reqId }, "Falta la configuracion del cliente en apiRepository/{consultarAPI}");
    throw new Error("Error de configuracion del cliente");
  }

  const urlDelCliente = `${cliente.storeUrl}/desguacesv8/api/recambios/piezas/`;

  if (estadoCircuito === ESTADOS_CIRCUITO.ABIERTO) {
    if (Date.now() < tiempoBloqueoHasta) {
      logger.error({ reqId, url: urlDelCliente }, "Circuito abierto, peticion rechazada para evitar saturacion.");
      throw new Error("Servicio en mantenimiento");
    }
    estadoCircuito = ESTADOS_CIRCUITO.SEMI_ABIERTO;
    logger.warn({ reqId }, "Modo SEMI-ABIERTO: Probando si la API ha vuelto a la vida");
  }

  const baseMs = 500;

  // Reintentos con backoff exponencial. Secuencial para no sobrecargar la API.
  for (let i = 1; i <= maxIntentos; i++) {
    const inicio = Date.now();

    try {
      logger.info({ reqId }, `Lanzando peticion a la API (Intento ${i}/${maxIntentos}) -> Query: "${parametrosBusqueda.q || 'vacia'}"`);

      const respuesta = await axios.get(urlDelCliente, {
        params: { locale: "es", ...parametrosBusqueda },
        timeout: DEFAULT_API_TIMEOUT,
      });

      const duracion = Date.now() - inicio;
      if (duracion > 3000) {
        logger.warn({ reqId, url: urlDelCliente }, `API lenta: ${duracion}ms`);
      }

      fallosConsecutivos = 0;
      estadoCircuito = ESTADOS_CIRCUITO.CERRADO;
      return respuesta.data;

    } catch (error) {
      const esUltimoIntento = (i === maxIntentos);
      logger.error({ reqId, url: urlDelCliente }, `Error en intento ${i}: ${error.message}`);

      if (esUltimoIntento) {
        manejarFracaso();
        throw new Error("Servicio temporalmente no disponible");
      }

      const delay = baseMs * Math.pow(2, i - 1);
      logger.info({ reqId }, `Reintentando en ${delay}ms...`);
      await esperar(delay);
    }
  }
};

function manejarFracaso() {
  fallosConsecutivos++;
  if (fallosConsecutivos >= UMBRAL_FALLOS) {
    estadoCircuito = ESTADOS_CIRCUITO.ABIERTO;
    tiempoBloqueoHasta = Date.now() + TIEMPO_RESETEO;
    logger.error(`¡CIRCUITO ACTIVADO! API bloqueada por ${TIEMPO_RESETEO / 1000}s.`);
  }
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Mapeo de campos del bot a campos reales de la API.
const CAMPO_API = {
  articulo: "articulo",
  marca:    "marca",
  modelo:   "modelo",
  version:  "version",
  ano:      null, // El año se extrae de la URL o anyosList.
};

/**
 * Extrae años de 4 dígitos presentes en la URL o alt de una pieza.
 */
const extraerAnosDePieza = (pieza) => {
  const texto = [pieza.url, pieza.alt].filter(Boolean).join(" ");
  const matches = texto.match(/\b(19|20)\d{2}\b/g);
  return matches ? [...new Set(matches)] : [];
};

/**
 * Normaliza el texto de la API manteniendo el valor original para los matches.
 */
const limpiarTextoParaSugerencia = (texto) => {
  if (!texto) return null;
  const limpio = String(texto).trim().replace(/\s+/g, " ");
  return limpio === "SIN DEFINIR" || limpio === "" ? null : limpio;
};

// Cabeceras para imitar un navegador y evitar bloqueos de CDN/proxies.
const HEADERS_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "es-ES,es;q=0.9",
};

/**
 * Mapeo de campos a claves de faceta en la respuesta de la API.
 */
const FACETA_API = {
  articulo: "articulos",
  marca:    "marcas",
  modelo:   "modelos",
  version:  "versiones",
  ano:      null,
};

/**
 * Extrae sugerencias de la faceta correspondiente al campo solicitado.
 * @param {Object} dataAPI - Respuesta de la API
 * @param {string} campoFaltante - Campo solicitado
 * @returns {string[]}
 */
const extraerDeFaceta = (dataAPI, campoFaltante) => {
  const claveAPI = FACETA_API[campoFaltante];
  if (!claveAPI) return [];

  const faceta = dataAPI[claveAPI];
  if (!Array.isArray(faceta) || faceta.length <= 1) return [];

  const sugerencias = [];
  for (const entrada of faceta) {
    if (entrada.id === 0 || entrada.total === "Total") continue;

    const texto = limpiarTextoParaSugerencia(String(entrada.text));
    if (!texto) continue;

    sugerencias.push(texto);
  }

  return sugerencias;
};

/**
 * Obtiene sugerencias para el siguiente campo vacío en la cascada del bot.
 */
const obtenerSugerencias = async (busquedaBD, campoFaltante, cliente) => {
  if (!cliente || !cliente.storeUrl) return [];

  if (!CAMPO_API.hasOwnProperty(campoFaltante)) {
    logger.warn(`[Sugerencias] Campo desconocido: '${campoFaltante}'`);
    return [];
  }

  // La API requiere la marca para poder devolver la lista de años.
  if (campoFaltante === "ano" && (!busquedaBD.marca || busquedaBD.marca === "null")) {
    logger.info("[Sugerencias] No se puede sugerir año sin marca.");
    return [];
  }

  const partesBusqueda = [
    busquedaBD.articulo,
    busquedaBD.marca,
    busquedaBD.modelo,
    busquedaBD.ano,
    busquedaBD.version,
  ].filter(val => val && val !== "null" && val.trim() !== "");

  if (partesBusqueda.length === 0) return [];

  const query = partesBusqueda.join(" ");
  const urlDelCliente = `${cliente.storeUrl}/desguacesv8/api/recambios/piezas/`;

  try {
    logger.info(`[Sugerencias] campo='${campoFaltante}' query="${query}"`);

    const respuesta = await axios.get(urlDelCliente, {
      params: { locale: "es", q: query, pagina: 1 },
      headers: HEADERS_NAVEGADOR,
      timeout: DEFAULT_SUGERENCIAS_TIMEOUT,
    });

    const dataAPI = respuesta.data;

    // Sugerencias de año usando anyosList (lista rápida devuelta por la API).
    if (campoFaltante === "ano") {
      const anyosList = dataAPI.anyosList || (dataAPI.facets && dataAPI.facets.anyosList);

      if (Array.isArray(anyosList) && anyosList.length > 0) {
        const procesados = [...new Set(anyosList.map(String))]
          .sort((a, b) => b - a);

        logger.info(`[Sugerencias] ${procesados.length} años extraídos de anyosList.`);
        return procesados;
      }

      // Fallback: extraer años de las piezas de la primera página.
      const piezas = dataAPI.piezas || [];
      const todosLosAnos = piezas.flatMap(extraerAnosDePieza);
      const anosFallback = [...new Set(todosLosAnos)].sort((a, b) => b - a);

      if (anosFallback.length > 0) {
        logger.info(`[Sugerencias] ${anosFallback.length} años extraídos vía fallback.`);
      }
      return anosFallback;
    }

    // Resto de campos usando facetas (marca, modelo, versión, artículo).
    const sugerencias = extraerDeFaceta(dataAPI, campoFaltante);

    if (sugerencias.length > 0) {
      logger.info(`[Sugerencias] ${sugerencias.length} opciones vía faceta '${FACETA_API[campoFaltante]}'`);
      return sugerencias;
    }

    // Fallback: extraer de los campos directos de las piezas.
    const piezas = dataAPI.piezas || [];
    const campoReal = CAMPO_API[campoFaltante];
    const mapaFallback = new Map();

    for (const pieza of piezas) {
      const valorLimpio = limpiarTextoParaSugerencia(pieza[campoReal]);
      if (!valorLimpio) continue;
      const key = valorLimpio.toLowerCase();
      if (!mapaFallback.has(key)) mapaFallback.set(key, valorLimpio);
    }

    const resFallback = Array.from(mapaFallback.values());
    if (resFallback.length > 0) {
      logger.info(`[Sugerencias] ${resFallback.length} opciones vía fallback.`);
    }
    return resFallback;

  } catch (error) {
    logger.warn(`[Sugerencias] Error general: ${error.message}`);
    return [];
  }
};

module.exports = { consultarAPI, obtenerSugerencias };