/**
 * Constantes globales del sistema para asegurar la integridad de los datos
 * y facilitar el mantenimiento.
 */
module.exports = {
  MODOS_BOT: {
    PREMIUM: "PREMIUM",
    FREE: "FREE"
  },
  ESTADOS_CIRCUITO: {
    ABIERTO: "ABIERTO",
    CERRADO: "CERRADO",
    SEMI_ABIERTO: "SEMI_ABIERTO"
  },
  VALORES_NULOS: {
    STRING_NULL: "null",
    VALOR_MEMORIA: "valor_memoria"
  },
  INTENT_TAGS: {
    START: "<SEARCH_INTENT>",
    END: "</SEARCH_INTENT>"
  }
};
