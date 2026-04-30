const axios = require("axios");
const logger = require("../utils/logger");

const checkHealth = async (req,res) => {

    const healthStatus = {
        estado: "OK",
        timestamp: new Date().toISOString(),
        tiempoEncendido: `${Math.floor(process.uptime())} segundos`, // tiempo del bot sin caerse
        memoriaUsada: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        apiExterna: "Comprobando..."
    };

    try{
        //Comprobamos si la API externa está viva
        const urlBase = process.env.API_URL || "https://dev4.desguacesyrecambios.com/desguacesv8/api/recambios/piezas/";

        await axios.get(urlBase, {
            params: { q: "ping" },
            timeout: 2000
        });

        //La API está viva
        healthStatus.apiExterna = "OK";
        logger.debug({ reqId: req.id}, "[Health] Chequeo de salud exitoso");

        return res.status(200).json(healthStatus);

    }catch(error) {
        healthStatus.estado = "DEGRADADO";
        healthStatus.apiExterna = "CAIDA_O_TIMEOUT";
        healthStatus.detalleError = error.message;

        logger.error({ reqId: req.id, err: error.message }, "[Health] Alerta: La API externa no responde al ping");

        return res.status(503).json(healthStatus);
    }
};
module.exports = {checkHealth};