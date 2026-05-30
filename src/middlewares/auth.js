const logger = require("../utils/logger");
const { getClienteByOrigin } = require("../config/clientes");

const authMiddleware = (req, res, next) => {
  // Leemos tanto api-key (de tu React) como x-api-key (de Postman)
  const apiKey = req.headers["api-key"] || req.headers["x-api-key"];
  const origin = req.headers.origin || req.headers.referer;

  if (!apiKey) {
    logger.warn({ id: req.id }, "Intento de acceso sin API key");
    return res.status(401).json({ error: "No autorizado. API key faltante." });
  }

  const cliente = getClienteByOrigin(origin);

  //  Comprobamos si el cliente existe, no el origin
  if (!cliente) {
    logger.warn({ origin }, "Intento de acceso desde dominio no registrado");
    return res
      .status(403)
      .json({ error: "Dominio no autorizado para usar este servicio." });
  }

  if (apiKey !== cliente.backendApiKey) {
    logger.warn({ ip: req.ip, origin }, "API key invalida para este cliente");
    return res.status(403).json({ error: "Prohibido. API key incorrecta." });
  }

  // Guardamos el cliente en la request para el uso futuro
  req.cliente = cliente;
  next();
};

module.exports = authMiddleware;
