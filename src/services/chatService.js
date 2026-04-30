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
 * Analiza la intención del usuario, gestiona la memoria a corto plazo (contexto),
 * consulta la base de datos de recambios y formatea la respuesta para el frontend.
 *
 * @param {string} message - El mensaje original escrito por el usuario.
 * @param {string} contextoAnterior - El estado o búsqueda previa acumulada en la sesión.
 * @param {string} reqId - Identificador único de la petición para el seguimiento en logs.
 * @returns {Promise<Object>} Un objeto estructurado con la respuesta de texto, las piezas y el nuevo contexto.
 */
const seleccionRespuesta = async (message, contextoAnterior, reqId) => {
  try {
    let textoAProcesar = textNormalize(message);
    const intentBusqueda = ["search.part", "search.vehicle"];

    // Evalúa la intención principal del usuario basándose únicamente en el texto actual.
    const analisisNuevoPuro = await intentService.detectIntent(textoAProcesar);

    // Comprueba si el usuario ha introducido términos reconocibles de automoción.
    const contieneDatosCoche = analisisNuevoPuro.queryLimpia.trim().length > 0;

    // Responde a interacciones genéricas (saludos, agradecimientos, quejas)
    // sin alterar la memoria de búsqueda actual y SIN escupir el contexto en pantalla.
    if (
      !intentBusqueda.includes(analisisNuevoPuro.intent) &&
      !contieneDatosCoche
    ) {
      logger.debug(
        { reqId },
        `Respondiendo con entrenamiento genérico: ${analisisNuevoPuro.intent}`,
      );
      return {
        respuesta: analisisNuevoPuro.respuestaAutomatica,
        piezas: [],
        nuevoContexto: contextoAnterior,
      };
    }

    // Si existe un historial de conversación, fusiona de forma inteligente
    if (contextoAnterior) {
      const analisisViejo = await intentService.detectIntent(contextoAnterior);

      const resultadoFusion = fusionarContextosInteligente(
        analisisViejo,
        analisisNuevoPuro,
      );
      textoAProcesar = resultadoFusion.textoFusionado;

      if (resultadoFusion.fueReset) {
        logger.info(
          { reqId },
          "Cambio de articulo detectado. Se vacia la memoria y se inicia nueva busqueda.",
        );
      } else {
        logger.info(
          { reqId },
          `Contexto refinado inteligentemente: "${textoAProcesar}"`,
        );
      }
    }

    // Analiza la frase final resultante de la fusión para extraer los filtros definitivos.
    const analisis = await intentService.detectIntent(textoAProcesar);
    const query = analisis.queryLimpia;
    const desglose = analisis.desglose;

    logger.info({ reqId }, `Entrando en busqueda. Query a enviar: "${query}"`);

    // Verifica si el filtro de normalización descartó toda la entrada del usuario.
    if (contextoAnterior && query === contextoAnterior) {
      logger.warn(
        { reqId },
        "El diccionario ignoro las palabras nuevas. Se aborta la repeticion.",
      );
      return {
        respuesta: "",
        piezas: [],
        nuevoContexto: contextoAnterior,
      };
    }

    // Comprueba que la consulta resultante tenga los elementos mínimos necesarios.
    const validacion = evaluarContexto(query, desglose);

    if (!validacion.esValido) {
      logger.warn(
        { reqId },
        "ChatService: Intent de busqueda detectado, pero no ha pasado los requisitos necesarios.",
      );
      return {
        respuesta: validacion.respuesta,
        nuevoContexto: textoAProcesar,
      };
    }

    // Consulta el sistema de caché local.
    const cacheKey = generarClaveCache(desglose);
    const datosCache = cacheService.obtenerDeCache(cacheKey);

    if (datosCache) {
      return datosCache;
    }

    // Realiza la petición externa a la API del desguace.
    const respuestaAPI = await apiRepository.consultarAPI({ q: query }, reqId);

    let resultadoFinal;
    const esBusquedaPorReferencia =
      desglose.referencias && desglose.referencias.length > 0;

    // Maneja el escenario donde la base de datos no devuelve piezas (Control-Z).
    if (!respuestaAPI.piezas || respuestaAPI.piezas.length == 0) {
      if (esBusquedaPorReferencia) {
        resultadoFinal = {
          respuesta:
            "No he encontrado piezas que existan con estas caracteristicas.",
          piezas: [],
          nuevoContexto: contextoAnterior,
        };
      } else {
        resultadoFinal = {
          respuesta: "",
          piezas: [],
          nuevoContexto: contextoAnterior,
        };
      }
    } else {
      // Procesa los resultados exitosos.
      const total = parseInt(respuestaAPI.total) || respuestaAPI.piezas.length;
      const piezasTop = respuestaAPI.piezas.slice(0, 4);

      const listaFormateada = formatearParaReact(piezasTop);
      const excedeLimite = total > LIMITE_GENERICO && !esBusquedaPorReferencia;

      const metadataFront = {
        totalReal: total,
        queryLimpia: query,
        excedeLimite: excedeLimite,
      };

      let respuestaBot = "";

      if (excedeLimite) {
        respuestaBot = `He encontrado demasiadas opciones (${total} piezas). Para ser mas preciso...`;
      } else if (total > 1) {
        respuestaBot = esBusquedaPorReferencia
          ? `He encontrado ${total} piezas en stock con la referencia "${desglose.referencias[0]}" . Aqui tienes las opciones:`
          : `He encontrado ${total} opciones en stock. Aqui tienes las mas relevantes:`;
      } else {
        respuestaBot = `Solo encontré esta opción:`;
      }

      resultadoFinal = {
        respuesta: respuestaBot,
        piezas: listaFormateada,
        metadata: metadataFront,
        nuevoContexto: query,
      };
    }

    cacheService.guardarEnCache(cacheKey, resultadoFinal);
    return resultadoFinal;
  } catch (error) {
    logger.error(
      { reqId, err: error },
      ` Error en chatService: ${error.message}`,
    );
    console.error(error.stack);

    return {
      respuesta: "Lo sentimos ocurrió un error al procesar tu búsqueda",
      nuevoContexto: contextoAnterior,
    };
  }
};

module.exports = { seleccionRespuesta };
