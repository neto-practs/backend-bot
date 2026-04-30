const logger = require("../utils/logger");
const chatService = require("../services/chatService");
const aiService = require("../services/aiService");
const cacheService = require("../services/cacheService");
const { MODOS_BOT } = require("../config/constants");

const MODO_BOT = process.env.MODO_BOT || MODOS_BOT.FREE;

/**
 * Controlador principal: Director de orquesta del Chatbot.
 * Valida la petición y decide si enviarla al motor de IA (Premium) o al NLP Local (Free).
 */
const procesarMensaje = async (req, res) => {
  const reqId = req.id;
  try {
    const mensajeRecibido = req.body.message;
    const contextoAnterior = req.body.contexto || "";

    //Escudoo contra contextos gigantes
    if (typeof contextoAnterior !== "string" || contextoAnterior.length > 500) {
      logger.warn(
        { reqId },
        "Petición rechazada: Contexto malformado o demasiado largo",
      );
      return res.status(400).json({ error: "Contexto inválido" });
    }

    //Validacion del campo; no empty
    if (mensajeRecibido === undefined || mensajeRecibido === null) {
      logger.warn({ reqId }, "Peticion rechazada: Mensaje vacio");
      return res.status(400).json({ error: "El mensaje no puede estar vacio" });
    }
    //Validacion de tipo string
    if (typeof mensajeRecibido !== "string") {
      logger.warn(
        { reqId },
        "Peticion rechazada: el mensaje no era un string",
      );
      return res.status(400).json({
        error: " Formato del mensaje incorrecto, solo cadenas de texto",
      });
    }
    //Validacion 1-400 carácteres
    if (mensajeRecibido.trim().length === 0 || mensajeRecibido.length > 400) {
      logger.warn(
        { reqId, longitud: mensajeRecibido.length },
        "Peticion rechazada: Longitud invalida",
      );
      return res
        .status(400)
        .json({ error: "El mensaje debe tener entre 1 y 400 caracteres." });
    }

    logger.info({ reqId }, `Procesando mensaje: "${mensajeRecibido}" (Modo: ${MODO_BOT})`);

    if (contextoAnterior) {
      logger.info({ reqId: req.id }, "Contexto previo detectado " + contextoAnterior);
    }

      let resultadoFinal = null;

      if (MODO_BOT === MODOS_BOT.PREMIUM) {
        // Intentamos respuesta con IA
      resultadoFinal = await aiService.seleccionRespuestaPremium(mensajeRecibido, contextoAnterior, reqId);

      // FALLBACK: Si la IA falla (devuelve null), usamos el modo FREE de emergencia
      if (!resultadoFinal) {
        logger.warn({ reqId }, "Fallback: IA no disponible, derivando a modo FREE");
        resultadoFinal = await chatService.seleccionRespuesta(mensajeRecibido, contextoAnterior, reqId);
      }
    } else {
      // Modo gratuito por defecto
      resultadoFinal = await chatService.seleccionRespuesta(mensajeRecibido, contextoAnterior, reqId);
    }

    return res.status(200).json(resultadoFinal);

    } catch (error) {
    logger.error(
      { reqId, err: error.message },
      "Error critico en el controlador de mensajes",
    );
    res.status(500).json({
      error:
        "Lo sentimos, ha ocurrido un error. Por favor, intentalo más tarde",
    });
  }
};

/**
 * Función administrativa para limpiar la caché de memoria.
 */
const vaciarCacheChat = (req, res) => {
  const clienteKey = req.headers["x-cache-key"];
  const masterKey = process.env.ADMIN_CACHE_KEY;

  if (!clienteKey || clienteKey !== masterKey) {
    logger.warn(
      { reqId: req.id, ip: req.ip },
      "Intento de vaciado de cache no autorizado",
    );
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    cacheService.vaciarCache();

    logger.info(
      { reqId: req.id, ip: req.ip },
      "Cache vaciada manualmente por el admin",
    );

    return res.status(200).json({
      mensaje: "Cache vaciada con exito",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ reqId: req.id, err: error }, "Error al vaciar la cache:");
    return res.status(500).json({ error: "Error interno al limpiar la cache" });
  }
};

module.exports = { procesarMensaje, vaciarCacheChat };
