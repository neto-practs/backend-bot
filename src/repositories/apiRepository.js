const axios = require("axios");
const logger = require("../utils/logger");
const { ESTADOS_CIRCUITO } = require("../config/constants");


// Variables del Circuit Breaker (Evita saturar la API si se cae)
let estadoCircuito = ESTADOS_CIRCUITO.CERRADO;
let fallosConsecutivos = 0;
let tiempoBloqueoHasta = 0;

const UMBRAL_FALLOS = Number(process.env.CB_Umbral) || 5; 
const TIEMPO_RESETEO = Number(process.env.CB_Reset) || 60000;


/**
 * Consulta la base de datos de piezas de un cliente específico.
 * * @param {Object} parametrosBusqueda - Filtros de la pieza (q: "alternador bmw", etc.)
 * @param {string} reqId - ID de trazabilidad para los logs
 * @param {Object} cliente - Objeto con la config del cliente (storeUrl, etc.)
 * @param {number} maxIntentos - Número máximo de reintentos antes de fallar
 */
const consultarAPI = async (parametrosBusqueda, reqId, cliente, maxIntentos = 3) => {
  
  if (!cliente || !cliente.storeUrl) {
    logger.error({ reqId }, "Falta la configuracion del cliente en apiRepository/{consultarAPI}");
    throw new Error("Error de configuracion del cliente");
  }

  //Construimos URL dinámica en la tienda del cliente actual
  const urlDelCliente = `${cliente.storeUrl}/desguacesv8/api/recambios/piezas/`;

  console.log("==================================================");
  console.log("URL QUE ESTÁ USANDO EL BOT:", urlDelCliente);
  console.log("==================================================");

  //Control del Circuito: Si está abierto, bloqueamos las peticiones de raíz
  if (estadoCircuito === ESTADOS_CIRCUITO.ABIERTO) {
    if (Date.now() < tiempoBloqueoHasta) {
      logger.error({ reqId, url: urlDelCliente }, "Circuito abierto, peticion rechazada para evitar saturacion.");
      throw new Error("Servicio en mantenimiento");
    } 
    estadoCircuito = ESTADOS_CIRCUITO.SEMI_ABIERTO;
    logger.warn({ reqId }, "Modo SEMI-ABIERTO: Probando si la API ha vuelto a la vida");
  }

  const baseMs = 500;

  //Bucle de reintentos en caso de que la red falle puntualmente
  for (let i = 1; i <= maxIntentos; i++) {
    const inicio = Date.now();

    try {
      logger.info({ reqId }, `Lanzando peticion a la API (Intento ${i}/${maxIntentos}) -> Query: "${parametrosBusqueda.q || 'vacia'}"`);

      const respuesta = await axios.get(urlDelCliente, {
        params: {
          locale: "es",
          ...parametrosBusqueda,
        },
        timeout: Number(process.env.API_TIMEOUT) || 5000,
      });

      // Si la API responde, pero va lenta, informamos
      const duracion = Date.now() - inicio;
      if (duracion > 3000) {
        logger.warn({ reqId, url: urlDelCliente }, `API lenta: ${duracion}ms`);
      }
      
      // La API funciona bien => reseteamos los contadores de fallos
      fallosConsecutivos = 0;
      estadoCircuito = ESTADOS_CIRCUITO.CERRADO;

      return respuesta.data;

    } catch (error) {
      const esUltimoIntento = (i === maxIntentos);
      logger.error({ reqId, url: urlDelCliente }, `Error en intento ${i}: ${error.message}`);

      // Si ya hemos gastado todas las oportunidsdes, activamos la alarma
      if (esUltimoIntento) {
        manejarFracaso();
        throw new Error("Servicio temporalmente no disponible");
      }
      
      // Backoff Exponencial: El tiempo de espera se duplica por cada fallo (500ms, 1000ms, 2000ms...)
      const delay = baseMs * Math.pow(2, i - 1);
      logger.info({ reqId }, `Reintentando en ${delay}ms...`);
      await esperar(delay);
    }
  }
};

// Sube el contador de fallos y abre el circuito si superamos el límite
function manejarFracaso() {
  fallosConsecutivos++;
  if (fallosConsecutivos >= UMBRAL_FALLOS) {
    estadoCircuito = ESTADOS_CIRCUITO.ABIERTO;
    tiempoBloqueoHasta = Date.now() + TIEMPO_RESETEO;
    logger.error(`¡CIRCUITO ACTIVADO! API bloqueada por ${TIEMPO_RESETEO / 1000}s.`);
  }
}

// Función auxiliar para pausar la ejecución del código
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { consultarAPI };