const intentService = require("../services/intentService");
const logger = require("../utils/logger");
const apiRepository = require("../repositories/apiRepository");
const { formatearParaReact } = require("../utils/formateadorPiezasReact");
const { evaluarContexto } = require("../utils/buscarValidacion");
const { textNormalize } = require("../utils/textNormalizer");
const { fusionarContextosInteligente } = require("../utils/contextManager");
const cacheService = require("./cacheService");
const { generarClaveCache } = require("../utils/cacheKeyGenerator");

const LIMITE_GENERICO = process.env.LIMITE_GENERICO || 500;

/**
 * Construye el mensaje de texto que el bot muestra al usuario cuando hay resultados.
 * @param {number} total - Número total de piezas encontradas
 * @param {boolean} esPorReferencia - Si la búsqueda fue por referencia OEM
 * @param {Object} desglose - Desglose de la query (para extraer la referencia exacta)
 * @returns {string}
 */
const construirMensajeResultado = (total, esPorReferencia, desglose) => {
  if (total > LIMITE_GENERICO && !esPorReferencia) {
    return `He encontrado demasiadas opciones (${total} piezas). Para ser más preciso...`;
  }
  if (total > 1) {
    return esPorReferencia
      ? `He encontrado ${total} piezas en stock con la referencia "${desglose.referencias[0]}". Aquí tienes las opciones:`
      : `He encontrado ${total} opciones en stock. Aquí tienes las más relevantes:`;
  }
  return `Solo encontré esta opción:`;
};

/**
 * Motor Free del chatbot (NLP local). Analiza la intención, gestiona el contexto
 * en memoria, consulta la API de recambios y devuelve la respuesta formateada.
 *
 * @param {string} mensaje - El mensaje original del usuario.
 * @param {string} contextoAnterior - Búsqueda acumulada de la sesión actual.
 * @param {string} reqId - ID único de la petición para trazabilidad en logs.
 * @param {Object} cliente - Configuración del cliente (storeUrl, etc.)
 * @returns {Promise<Object>} Respuesta estructurada con texto, piezas y nuevo contexto.
 */
const seleccionRespuesta = async (mensaje, contextoAnterior, reqId, cliente) => {
  try {
    let textoBusqueda = textNormalize(mensaje);
    const intentsBusqueda = ["search.part", "search.vehicle"];

    const intentActual = await intentService.detectIntent(textoBusqueda);
    const contieneDatosCoche = intentActual.queryLimpia.trim().length > 0;

    // Las interacciones genéricas (saludos, agradecimientos) no deben alterar el contexto.
    if (!intentsBusqueda.includes(intentActual.intent) && !contieneDatosCoche) {
      logger.debug({ reqId }, `Respondiendo con entrenamiento genérico: ${intentActual.intent}`);
      return {
        respuesta: intentActual.respuestaAutomatica,
        piezas: [],
        sugerencias: [],
        nuevoContexto: contextoAnterior,
      };
    }

    if (contextoAnterior) {
      const intentAnterior = await intentService.detectIntent(contextoAnterior);
      const fusion = fusionarContextosInteligente(intentAnterior, intentActual);
      textoBusqueda = fusion.textoFusionado;

      if (fusion.fueReset) {
        logger.info({ reqId }, "Cambio de artículo detectado. Memoria reiniciada, nueva búsqueda.");
      } else {
        logger.info({ reqId }, `Contexto refinado: "${textoBusqueda}"`);
      }
    }

    const intentFinal = await intentService.detectIntent(textoBusqueda);
    const { queryLimpia: query, desglose } = intentFinal;

    logger.info({ reqId }, `Entrando en búsqueda. Query: "${query}"`);

    if (contextoAnterior && query === contextoAnterior) {
      logger.warn({ reqId }, "El diccionario ignoró las palabras nuevas. Abortando repetición.");
      return { respuesta: "", piezas: [], sugerencias: [], nuevoContexto: contextoAnterior };
    }

    const validacion = evaluarContexto(query, desglose);
    if (!validacion.esValido) {
      logger.warn({ reqId }, "Intent de búsqueda detectado sin requisitos mínimos.");
      return {
        respuesta: validacion.respuesta,
        piezas: [],
        sugerencias: [],
        nuevoContexto: textoBusqueda,
      };
    }

    const cacheKey = generarClaveCache(desglose);
    const datosCache = cacheService.obtenerDeCache(cacheKey);
    if (datosCache) return datosCache;

    const respuestaAPI = await apiRepository.consultarAPI({ q: query }, reqId, cliente);
    const esPorReferencia = desglose.referencias?.length > 0;

    let resultadoFinal;

    if (!respuestaAPI.piezas || respuestaAPI.piezas.length === 0) {
      resultadoFinal = {
        respuesta: esPorReferencia
          ? "No he encontrado piezas que existan con estas características."
          : "",
        piezas: [],
        sugerencias: [],
        nuevoContexto: contextoAnterior,
      };
    } else {
      const total = parseInt(respuestaAPI.total) || respuestaAPI.piezas.length;
      const piezasFormateadas = formatearParaReact(respuestaAPI.piezas.slice(0, 4), cliente.storeUrl);

      resultadoFinal = {
        respuesta: construirMensajeResultado(total, esPorReferencia, desglose),
        piezas: piezasFormateadas,
        sugerencias: [],
        metadata: {
          totalReal: total,
          queryLimpia: query,
          excedeLimite: total > LIMITE_GENERICO && !esPorReferencia,
        },
        nuevoContexto: query,
      };
    }

    cacheService.guardarEnCache(cacheKey, resultadoFinal);
    return resultadoFinal;

  } catch (error) {
    logger.error({ reqId, err: error }, `Error en chatService: ${error.message}`);
    return {
      respuesta: "Lo sentimos, ocurrió un error al procesar tu búsqueda.",
      piezas: [],
      sugerencias: [],
      nuevoContexto: contextoAnterior,
    };
  }
};

module.exports = { seleccionRespuesta };
