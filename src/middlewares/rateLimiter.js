const limiter = require("express-rate-limit");
const logger = require("../utils/logger");
require("dotenv").config();

//Evita que peten a la API
const apiLimiter = limiter({
  windowMs: 1 * 60 * 1000, // 1 min
  max: process.env.limit || 10,

  handler: (req, res, options) => {
    const fechaDesbloqueo = req.rateLimit.resetTime.getTime();
    const segundosTotales = Math.ceil((fechaDesbloqueo - Date.now()) / 1000);

    const minutos = Math.floor(segundosTotales / 60);
    const segundos = segundosTotales % 60;

    let textoTiempo = "";

    // Concatenamos los minutos que tenemos
    if (minutos === 1) {
      textoTiempo = minutos + " minuto y ";
    } else if (minutos > 1) {
      textoTiempo = minutos + " minutos y ";
    }

    // Concatenamos los segundos que nos quedan
    if (segundos === 1) {
      textoTiempo = textoTiempo + "1 segundo";
    } else {
      textoTiempo = textoTiempo + segundos + " segundos";
    }

    logger.warn(
      { reqId: req.id, ip: req.ip },
      `IP bloqueada por exceso de peticiones, tiempo restante: ${textoTiempo}`,
    );

    res.status(429).json({
      error: "Has superado el limite de consultas en el desguace.",
      tiempo: `Por favor, espere ${textoTiempo} antes de volver a intentarlo.`,
      codigo: "RATE_LIMIT_EXCEEDED",
      segundosParaReact: segundosTotales,
    });
  },

  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { apiLimiter };
