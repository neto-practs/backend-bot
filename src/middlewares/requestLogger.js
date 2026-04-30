const crypto = require("crypto");
const logger = require("../utils/logger");

//Asigna ID único a cada petición de entrada y registra su llegada.

const requestLogger = (req, res, next) => {
  req.id = crypto.randomUUID();

  logger.info(
    { reqId: req.id, method: req.method, url: req.originalUrl },
    "Peticion entrante",
  );

  next();
};

module.exports = requestLogger;
