const axios = require("axios");
const logger = require("../utils/logger");
const { ESTADOS_CIRCUITO } = require("../config/constants");

// Circuit Breaker: evita saturar la API externa si se cae repetidamente.
let estadoCircuito = ESTADOS_CIRCUITO.CERRADO;
let fallosConsecutivos = 0;
let tiempoBloqueoHasta = 0;

const UMBRAL_FALLOS = Number(process.env.CB_Umbral) || 5;
const TIEMPO_RESETEO = Number(process.env.CB_Reset) || 60000;
// Leído del .env para que ops pueda ajustarlo sin tocar código.
const DEFAULT_SUGERENCIAS_TIMEOUT = Number(process.env.SUGERENCIAS_TIMEOUT_MS) || 15000;
const DEFAULT_API_TIMEOUT = Number(process.env.API_TIMEOUT_MS) || 5000;


/**
 * Consulta la base de datos de piezas de un cliente específico.
 * @param {Object} parametrosBusqueda - Filtros de la pieza (q: "alternador bmw", etc.)
 * @param {string} reqId - ID de trazabilidad para los logs
 * @param {Object} cliente - Objeto con la config del cliente (storeUrl, etc.)
 * @param {number} maxIntentos - Número máximo de reintentos antes de fallar
 */
const consultarAPI = async (parametrosBusqueda, reqId, cliente, maxIntentos = 3) => {
  if (!cliente || !cliente.storeUrl) {
    logger.error({ reqId }, "Falta la configuracion del cliente en apiRepository/{consultarAPI}");
    throw new Error("Error de configuracion del cliente");
  }

  const urlDelCliente = `${cliente.storeUrl}/desguacesv8/api/recambios/piezas/`;
  logger.debug({ reqId, url: urlDelCliente }, "URL de destino construida.");

  if (estadoCircuito === ESTADOS_CIRCUITO.ABIERTO) {
    if (Date.now() < tiempoBloqueoHasta) {
      logger.error({ reqId, url: urlDelCliente }, "Circuito abierto, peticion rechazada para evitar saturacion.");
      throw new Error("Servicio en mantenimiento");
    }
    estadoCircuito = ESTADOS_CIRCUITO.SEMI_ABIERTO;
    logger.warn({ reqId }, "Modo SEMI-ABIERTO: Probando si la API ha vuelto a la vida");
  }

  const baseMs = 500;

  // Bucle de reintentos con backoff exponencial (500ms, 1000ms, 2000ms...).
  // Secuencial y no paralelo para no agravar una API ya sobrecargada.
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

// Incrementa el contador de fallos y abre el circuito al superar el umbral.
function manejarFracaso() {
  fallosConsecutivos++;
  if (fallosConsecutivos >= UMBRAL_FALLOS) {
    estadoCircuito = ESTADOS_CIRCUITO.ABIERTO;
    tiempoBloqueoHasta = Date.now() + TIEMPO_RESETEO;
    logger.error(`¡CIRCUITO ACTIVADO! API bloqueada por ${TIEMPO_RESETEO / 1000}s.`);
  }
}

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
  // La API no expone un campo "año" directo; los años de compatibilidad
  // están embebidos en el slug de URL (ej: "alternador-audi-a6-2002-2003-2004-9145437").
  const texto = [pieza.url, pieza.alt].filter(Boolean).join(" ");
  const matches = texto.match(/\b(19|20)\d{2}\b/g);
  return matches ? [...new Set(matches)] : [];
};

/**
 * Normaliza el texto de la API para usarlo como sugerencia.
 * Mantiene el valor original (mayúsculas, guiones) para que haga match exacto en la BD.
 */
const limpiarTextoParaSugerencia = (texto) => {
  if (!texto) return null;
  const limpio = String(texto).trim().replace(/\s+/g, " ");
  return limpio === "SIN DEFINIR" || limpio === "" ? null : limpio;
};

// ─── Cabeceras que imitan un navegador real ──────────────────────────────────
// CRÍTICO: Algunos CDN/proxies de tiendas bloquean peticiones sin User-Agent
// de navegador. Sin estos headers, la API podría ignorar parámetros de paginación.
const HEADERS_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "es-ES,es;q=0.9",
};

/**
 * Mapeo: campo de la cascada del bot → clave de la faceta en la respuesta de la API.
 *
 * ESTUDIO DE FACETAS (27-May-2026):
 *  La API devuelve metadatos de facetas en la PRIMERA petición, junto con las 12 piezas.
 *  Esto nos permite extraer sugerencias en UNA SOLA petición HTTP para 4 de los 5 campos.
 *
 *  Estructura de cada faceta: Array<{ id: number, text: string|number, total: number|string }>
 *  El elemento [0] de cada array es siempre el encabezado (id=0, text="Modelo", total="Total")
 *  y debe ser filtrado antes de usar los datos.
 *
 *  Disponibilidad por campo:
 *  ✅ articulo → 'articulos'  Array[n] — texto limpio (ej: "ALTERNADOR")
 *  ✅ marca    → 'marcas'     Array[n] — texto limpio (ej: "AUDI")
 *  ✅ modelo   → 'modelos'    Array[n] — ATENCIÓN: text puede ser numérico (100, 8090)
 *  ✅ version  → 'versiones'  Array[n] — texto limpio (ej: "A6 BERLINA 4B2")
 *  ⚠️  ano     → 'anyos'      Objeto {min, max} — NO es una lista. Requiere paginación.
 */
const FACETA_API = {
  articulo: "articulos",
  marca:    "marcas",
  modelo:   "modelos",
  version:  "versiones",
  ano:      null, // La API solo devuelve {min, max}, no una lista de años.
};

/**
 * Extrae sugerencias de la faceta correspondiente al campo solicitado.
 * La API devuelve arrays como: [{id:0, text:"Modelo", total:"Total"}, {id:1, text:"A6", total:15}, ...]
 * El primer elemento (id=0) es el encabezado → se filtra antes de extraer.
 * @param {Object} dataAPI - La respuesta completa de la API (respuesta.data)
 * @param {string} campoFaltante - Campo de la cascada del bot ('marca', 'modelo', etc.)
 * @param {number} maxSugerencias - Número máximo de sugerencias a devolver
 * @returns {string[]} Lista de sugerencias limpias, o [] si la faceta está vacía.
 */
const extraerDeFaceta = (dataAPI, campoFaltante, maxSugerencias = 15) => {
  const claveAPI = FACETA_API[campoFaltante];
  if (!claveAPI) return []; // Campo sin faceta (ej: 'ano')

  const faceta = dataAPI[claveAPI];
  if (!Array.isArray(faceta) || faceta.length <= 1) return []; // Vacía o solo encabezado

  const sugerencias = [];
  for (const entrada of faceta) {
    // Saltar el encabezado (id=0, total="Total")
    if (entrada.id === 0 || entrada.total === "Total") continue;

    const texto = limpiarTextoParaSugerencia(String(entrada.text));
    if (!texto) continue;

    sugerencias.push(texto);
    if (sugerencias.length >= maxSugerencias) break;
  }

  return sugerencias;
};

/**
 * Consulta la API para obtener sugerencias del siguiente campo vacío en la cascada.
 *
 * ESTRATEGIA HÍBRIDA (implementada tras estudio de facetas del 27-May-2026):
 *
 *  Para campos con faceta (marca, modelo, version, articulo):
 *    → 1 única petición HTTP. Las facetas contienen TODOS los valores únicos de la BD,
 *      no solo los 12 de la página actual. Máximo rendimiento.
 *
 *  Para el campo 'ano':
 *    → Bucle de paginación (la API solo da {min, max}, no lista de años).
 *      Extraemos los años de la URL de cada pieza (ej: "...a6-2002-2003-2004-...").
 *
 * PARÁMETROS CLAVE DESCUBIERTOS EN LA SONDA:
 *  - Parámetro de página correcto: `pagina` (no `page` — ignorado por la API).
 *  - Límite fijo de 12 piezas por página (sin parámetro de control).
 *  - ID de pieza: `idPost`.
 */
const obtenerSugerencias = async (busquedaBD, campoFaltante, cliente) => {
  if (!cliente || !cliente.storeUrl) return [];

  if (!CAMPO_API.hasOwnProperty(campoFaltante)) {
    logger.warn(`[Sugerencias] Campo desconocido: '${campoFaltante}'`);
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
    // ════════════════════════════════════════════════════════════════════════
    // RUTA A: Extracción por FACETAS (1 petición) — para todos los campos
    //         menos 'ano', que la API no expone como lista.
    // ════════════════════════════════════════════════════════════════════════
    if (campoFaltante !== "ano") {
      logger.info(`[Sugerencias/Facetas] campo='${campoFaltante}' query="${query}"`);

      const respuesta = await axios.get(urlDelCliente, {
        params: { locale: "es", q: query, pagina: 1 },
        headers: HEADERS_NAVEGADOR,
        timeout: DEFAULT_SUGERENCIAS_TIMEOUT,
      });

      const sugerencias = extraerDeFaceta(respuesta.data, campoFaltante, 15);

      if (sugerencias.length > 0) {
        logger.info(`[Sugerencias/Facetas] ✅ ${sugerencias.length} opciones vía faceta '${FACETA_API[campoFaltante]}'`);
        return sugerencias;
      }

      // Fallback: si la faceta vino vacía (búsqueda muy específica), extraemos
      // del array de piezas de la misma respuesta (ya no hay coste extra).
      logger.warn(`[Sugerencias/Facetas] Faceta vacía para '${campoFaltante}'. Extrayendo de piezas de pág 1.`);
      const piezas = respuesta.data.piezas || [];
      const campoReal = CAMPO_API[campoFaltante];
      const mapaFallback = new Map();
      for (const pieza of piezas) {
        const valorLimpio = limpiarTextoParaSugerencia(pieza[campoReal]);
        if (!valorLimpio) continue;
        const key = valorLimpio.toLowerCase();
        if (!mapaFallback.has(key)) mapaFallback.set(key, valorLimpio);
      }
      return Array.from(mapaFallback.values()).slice(0, 15);
    }

    // ════════════════════════════════════════════════════════════════════════
    // RUTA B: Bucle de PAGINACIÓN — solo para 'ano'
    //         La API solo devuelve anyos:{min, max} (no una lista de años).
    //         Extraemos los años del slug de URL de cada pieza.
    // ════════════════════════════════════════════════════════════════════════
    logger.info(`[Sugerencias/Paginación] campo='ano' query="${query}" (la API no expone lista de años)`);

    const resPag1 = await axios.get(urlDelCliente, {
      params: { locale: "es", q: query, pagina: 1 },
      headers: HEADERS_NAVEGADOR,
      timeout: DEFAULT_SUGERENCIAS_TIMEOUT,
    });

    const totalPiezas = resPag1.data.total ?? 0;
    let todasLasPiezas = resPag1.data.piezas || [];

    if (todasLasPiezas.length === 0) return [];

    const idsVistos = new Set(todasLasPiezas.map(p => p.idPost));

    const PIEZAS_POR_PAGINA = 12;
    const MAX_PAGINAS = 8;
    const totalPaginas = Math.min(Math.ceil(totalPiezas / PIEZAS_POR_PAGINA), MAX_PAGINAS);

    for (let p = 2; p <= totalPaginas; p++) {
      try {
        const resExtra = await axios.get(urlDelCliente, {
          params: { locale: "es", q: query, pagina: p },
          headers: HEADERS_NAVEGADOR,
          timeout: DEFAULT_SUGERENCIAS_TIMEOUT,
        });

        const nuevasPiezas = resExtra.data.piezas || [];
        const distintas    = nuevasPiezas.filter(p => !idsVistos.has(p.idPost));

        // Guardia anti-bucle infinito: si la API deja de paginar, paramos.
        if (distintas.length === 0 && nuevasPiezas.length > 0) {
          logger.warn(`[Sugerencias/Paginación] Pág ${p}: 0 piezas nuevas (posible paginación rota). Parando.`);
          break;
        }

        distintas.forEach(pieza => idsVistos.add(pieza.idPost));
        todasLasPiezas = todasLasPiezas.concat(distintas);

      } catch (errorPagina) {
        logger.warn(`[Sugerencias/Paginación] Pág ${p} falló (${errorPagina.message}). Continuando...`);
        continue;
      }
    }

    const todosLosAnos = todasLasPiezas.flatMap(extraerAnosDePieza);
    const anosUnicos = [...new Set(todosLosAnos)].sort().slice(0, 15);

    logger.info(`[Sugerencias/Paginación] ✅ ${anosUnicos.length} años extraídos de ${todasLasPiezas.length} piezas.`);
    return anosUnicos;

  } catch (error) {
    logger.warn(`[Sugerencias] Error general: ${error.message}`);
    return [];
  }
};

module.exports = { consultarAPI, obtenerSugerencias };