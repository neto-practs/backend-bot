const logger = require("../utils/logger");

const authMiddleware = (req, res, next) => {
  if (req.headers["api-key"] !== process.env.API_KEY) {
    logger.warn(
      { reqId: req.id, ip: req.ip },
      "Intento de Conexion rechazada: Token invaldio!",
    );

    return res
      .status(401)
      .json({ error: "Conexion rechazada, usuario no autorizado" });
  }

  next();
};
module.exports = authMiddleware;
