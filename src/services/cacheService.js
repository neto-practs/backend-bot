require("dotenv").config();
const { LRUCache } = require("lru-cache");
const logger = require("../utils/logger");

const ttlSeconds = parseInt(process.env.CACHE_TTL_SECONDS) || 600;

const metricas = { hits: 0, misses: 0 };

const cacheMemoria = new LRUCache({
  max: 500, //Limite de capacidad, si se pasa se borra la más antigua
  ttl: ttlSeconds * 1000, //tiempo de vida de los datos (.env)
  updateAgeOnGet: true, //Reinicia TTL si la entrada se vuelve a usar.
  ttlAutopurge: true, // Limpieza en segundo plano de los caducados
});

const obtenerDeCache = (key) => {
  const dato = cacheMemoria.get(key);
  if (dato) {
    metricas.hits++;
    logger.info(`[Cache] HIT -> Key: ${key}`);
    return dato;
  }
  metricas.misses++;
  logger.info(`[Cache] MISS -> Key: ${key}`);
  return null;
};

const guardarEnCache = (key, data) => {
  cacheMemoria.set(key, data);
  logger.info(`[Cache] GUARDADO - Nuevo dato en RAM -> Key: ${key}`);
};

const vaciarCache = () => {
  cacheMemoria.clear(); //vacia el LRU por completo
  metricas.hits = 0;
  metricas.misses = 0;
  logger.info(`[Cache] FLUSH - Memoria interna liberada`);
};

//Contiene Hits, Misses, Keys.
const obtenerMetricas = () => {
  return {
    hits: metricas.hits,
    misses: metricas.misses,
    keyActuales: cacheMemoria.size,
  };
};

const minutos = parseInt(process.env.CACHE_METRICS_INTERVAL_MINUTES) || 60;

//Envio periodico en el logger
setInterval(
  () => {
    logger.info(
      { metricasCache: obtenerMetricas() },
      `[Cache] Reporte periodico (${minutos}m)`,
    );
  },
  minutos * 60 * 1000,
); // * 60.000 para ponerlo en ms

module.exports = {
  obtenerDeCache,
  guardarEnCache,
  vaciarCache,
  obtenerMetricas,
};
