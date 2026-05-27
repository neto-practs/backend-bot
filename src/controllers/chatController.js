const logger = require("../utils/logger");
const chatService = require("../services/chatService");
const aiService = require("../services/aiService");
const cacheService = require("../services/cacheService");
const { MODOS_BOT } = require("../config/constants");

const MODO_BOT = process.env.MODO_BOT || MODOS_BOT.FREE;

/**
 * Valida que el cuerpo de la petición sea procesable antes de llegar al servicio.
 * @param {Object} req - Objeto de petición Express
 * @returns {{ valido: boolean, status?: number, error?: string }}
 */
const validarPeticion = (req) => {
  const { message, contexto = "" } = req.body;

  if (typeof contexto !== "string" || contexto.length > 500) {
    return { valido: false, status: 400, error: "Contexto inválido" };
  }
  if (message === undefined || message === null) {
    return { valido: false, status: 400, error: "El mensaje no puede estar vacío" };
  }
  if (typeof message !== "string") {
    return { valido: false, status: 400, error: "Formato del mensaje incorrecto, solo cadenas de texto" };
  }
  if (message.trim().length === 0 || message.length > 400) {
    return { valido: false, status: 400, error: "El mensaje debe tener entre 1 y 400 caracteres." };
  }

  return { valido: true };
};

/**
 * Controlador principal: decide qué motor procesa el mensaje (Premium o Free)
 * y devuelve la respuesta estructurada al frontend.
 */
const procesarMensaje = async (req, res) => {
  const reqId = req.id;

  try {
    const validacion = validarPeticion(req);
    if (!validacion.valido) {
      logger.warn({ reqId }, `Petición rechazada: ${validacion.error}`);
      return res.status(validacion.status).json({ error: validacion.error });
    }

    const mensajeRecibido = req.body.message;
    const contextoAnterior = req.body.contexto || "";

    logger.info({ reqId }, `Procesando mensaje: "${mensajeRecibido}" (Modo: ${MODO_BOT})`);
    if (contextoAnterior) {
      logger.info({ reqId }, `Contexto previo detectado: ${contextoAnterior}`);
    }

    let resultadoFinal;

    if (MODO_BOT === MODOS_BOT.PREMIUM) {
      resultadoFinal = await aiService.seleccionRespuestaPremium(
        mensajeRecibido, contextoAnterior, reqId, req.cliente
      );
      // Si la IA falla o devuelve null, el modo FREE actúa como red de seguridad.
      if (!resultadoFinal) {
        logger.warn({ reqId }, "IA no disponible, derivando a modo FREE.");
        resultadoFinal = await chatService.seleccionRespuesta(
          mensajeRecibido, contextoAnterior, reqId, req.cliente
        );
      }
    } else {
      resultadoFinal = await chatService.seleccionRespuesta(
        mensajeRecibido, contextoAnterior, reqId, req.cliente
      );
    }

    return res.status(200).json(resultadoFinal);

  } catch (error) {
    logger.error({ reqId, err: error.message }, "Error crítico en el controlador de mensajes");
    return res.status(500).json({
      error: "Lo sentimos, ha ocurrido un error. Por favor, inténtalo más tarde",
    });
  }
};

/**
 * Endpoint administrativo para vaciar la caché de memoria manualmente.
 * Requiere la cabecera `x-cache-key` con la clave maestra del entorno.
 */
const vaciarCacheChat = (req, res) => {
  const claveRecibida = req.headers["x-cache-key"];
  const claveMaestra = process.env.ADMIN_CACHE_KEY;

  if (!claveRecibida || claveRecibida !== claveMaestra) {
    logger.warn({ reqId: req.id, ip: req.ip }, "Intento de vaciado de caché no autorizado");
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    cacheService.vaciarCache();
    logger.info({ reqId: req.id, ip: req.ip }, "Caché vaciada manualmente por el administrador");
    return res.status(200).json({
      mensaje: "Caché vaciada con éxito",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ reqId: req.id, err: error }, "Error al vaciar la caché");
    return res.status(500).json({ error: "Error interno al limpiar la caché" });
  }
};

module.exports = { procesarMensaje, vaciarCacheChat };
