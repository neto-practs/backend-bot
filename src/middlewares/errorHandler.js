const logger = require("../utils/logger");

const notFoundHandler = (req, res) => {
  logger.warn(
    { reqId: req.id, url_intentada: req.originalUrl },
    "Ruta no encontrada",
  );

  res.status(404).json({ error: "Ruta no encontrada" });
};

const globalErrorHandler = (err, req, res, next) => {
  // Captura de errores de formato JSON en el body
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    logger.error(
      { reqId: req.id, err: err.message },
      "Peticion rechazada en la puerta: JSON mal formado/corrupto",
    );

    return res
      .status(400)
      .json({ error: "El formato de los datos enviados no es valido" });
  }

  // Errores no contemplados
  logger.error(
    { reqId: req.id, err: err.stack },
    "Error critico global, no capturado",
  );

  return res.status(500).json({
    error: "Lo sentimos, ocurrio un error interno, Intentelo mas tarde.",
  });
};

module.exports = { notFoundHandler, globalErrorHandler };
