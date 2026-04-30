const logger = require("../utils/logger");
const { getSystemPrompt } = require("../config/prompts");
const apiRepository = require("../repositories/apiRepository");
const cacheService = require("./cacheService");
const { formatearParaReact } = require("../utils/formateadorPiezasReact");
const { generarClaveCache } = require("../utils/cacheKeyGenerator");
const { fusionarContexto } = require("../utils/contextHelper");
const { seleccionRespuesta } = require("./chatService"); // Fallback al modo FREE si la IA falla
const { VALORES_NULOS } = require("../config/constants");
const { generarRespuestaUsuario } = require("../utils/dialogHelper");

// Configuración desde el .ENV
const RUNPOD_IA_URL     = process.env.RUNPOD_IA_URL;
const RUNPOD_IA_TOKEN   = process.env.RUNPOD_IA_TOKEN;
const RUNPOD_IA_MODEL   = process.env.RUNPOD_IA_MODEL;
const AI_TEMPERATURE    = parseFloat(process.env.RUNPOD_AI_TEMPERATURE) || 0.0;
const AI_MAX_TOKENS     = parseInt(process.env.RUNPOD_AI_MAX_TOKENS)    || 400;
const STORE_BASE_URL    = process.env.STORE_BASE_URL;
const LIMITE_GENERICO   = parseInt(process.env.LIMITE_GENERICO)         || 500;

// Esquema JSON que el motor de inferencia forzará en la salida.
// El modelo no puede devolver tokens fuera de esta estructura.
const GUIDED_JSON_SCHEMA = {
  type: "object",
  properties: {
    respuesta_usuario: { type: "string"           },  // Texto que ve el cliente
    _razonamiento:     { type: "string"           }, 
    es_conversacion:   { type: "boolean"          },  // Chivato de charla/small talk
    realizar_busqueda: { type: "boolean"          },
    articulo:          { type: ["string", "null"] },
    referencia:        { type: ["string", "null"] },
    marca:             { type: ["string", "null"] },
    modelo:            { type: ["string", "null"] },
    ano:               { type: ["string", "null"] },
    version:           { type: ["string", "null"] },
  },
  required: ["respuesta_usuario", "realizar_busqueda", "es_conversacion", "articulo", "marca", "modelo"],
};

/**
 * Llama al modelo IA y devuelve la respuesta estructurada lista para el frontend.
 * @param {string} promptUsuario    - Mensaje del usuario
 * @param {string} contextoAnterior - JSON string con la memoria previa
 * @param {string} reqId            - ID de petición para los logs
 */
const seleccionRespuestaPremium = async (promptUsuario, contextoAnterior = "", reqId = "test") => {
  try {
    logger.info({ reqId }, `Iniciando peticion a vLLM (Modelo: ${RUNPOD_IA_MODEL})...`);

    const promptDelSistema = getSystemPrompt(STORE_BASE_URL, contextoAnterior);

    const response = await fetch(RUNPOD_IA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RUNPOD_IA_TOKEN}`,
      },
      body: JSON.stringify({
        model:       RUNPOD_IA_MODEL,
        messages: [
          { role: "system", content: promptDelSistema },
          { role: "user",   content: promptUsuario    },
        ],
        temperature:     AI_TEMPERATURE,
        max_tokens:      AI_MAX_TOKENS,
        response_format: { type: "json_object" }, // Activa modo JSON en vLLM
        guided_json:     GUIDED_JSON_SCHEMA,       // Fuerza el esquema exacto
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`vLLM fallo: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textoFinal = data.choices[0].message.content.trim();

    // Con guided_json el modelo devuelve JSON puro
    let intentExtraido = null;
    let mensajeParaUsuario = "";
    let busquedaBD = null;

    try {
      intentExtraido = JSON.parse(textoFinal);

      // 1. Aplicamos el filtro de memoria (fusionarContexto protege contra resets incorrectos)
      busquedaBD = fusionarContexto(contextoAnterior, intentExtraido);

      // 2. Evaluamos quién tiene el micro: ¿La IA o el Backend?
      if (intentExtraido.es_conversacion) {
        // Es charla general (saludos, agradecimientos, insultos). Habla la IA.
        mensajeParaUsuario = intentExtraido.respuesta_usuario || "Dime, ¿en qué más te puedo ayudar?";
        logger.info({ reqId }, "Modo Charla activado. Habla la IA.");
      } else {
        // Es extracción de datos pura. Habla el francotirador NLU.
        mensajeParaUsuario = generarRespuestaUsuario(busquedaBD);
        intentExtraido.respuesta_usuario = mensajeParaUsuario; // Lo sobreescribimos para los logs
      }

    } catch (e) {
      // Si el JSON está roto (caso muy raro con guided_json), tratamos el texto como respuesta directa
      logger.error({ reqId, err: e }, "La IA genero un JSON invalido a pesar del guided_json.");
      mensajeParaUsuario = textoFinal;
    }

    logger.info({ reqId, intentExtraido: !!busquedaBD }, "IA respondio con exito.");

    // INTERRUPTOR DE BÚSQUEDA — doble validación: IA + lógica propia
    let quiereBuscar = false;

    if (busquedaBD) {
      quiereBuscar = busquedaBD.realizar_busqueda === true;

      const tieneTridente  = busquedaBD.articulo && busquedaBD.marca && busquedaBD.modelo;
      const tieneReferencia = !!busquedaBD.referencia;

      // Si tiene los datos suficientes, buscamos independientemente de lo que dijo la IA
      if (tieneTridente || tieneReferencia) quiereBuscar = true;

      // Escudo anti-búsqueda masiva: si la IA quiere buscar pero faltan marca o modelo
      if (quiereBuscar && !tieneReferencia && (!busquedaBD.articulo || !busquedaBD.marca || !busquedaBD.modelo)) {
        logger.warn({ reqId }, "IA intento buscar sin marca/modelo. Bloqueando.");
        quiereBuscar = false;
        if (!mensajeParaUsuario) {
          mensajeParaUsuario = `Para buscar tu ${busquedaBD.articulo || "pieza"}, necesito la marca y el modelo del vehículo.`;
        }
      }

      // Limpiamos metadatos internos antes de usar el objeto para búsquedas o caché
      delete busquedaBD.realizar_busqueda;
      delete busquedaBD._razonamiento;
      delete busquedaBD.respuesta_usuario;
      delete busquedaBD.es_conversacion; // Limpiamos el chivato
    }

    // FASE 1: No hay datos suficientes o es conversación
    if (!busquedaBD || !quiereBuscar) {
      return {
        respuesta:     mensajeParaUsuario,
        piezas:        [],
        nuevoContexto: busquedaBD ? JSON.stringify(busquedaBD) : contextoAnterior,
      };
    }

    // FASE 2: Tenemos datos — construimos la query y lanzamos a la API
    const query = Object.values(busquedaBD)
      .filter(val => val !== null && val !== VALORES_NULOS.STRING_NULL && val !== "")
      .join(" ");

    const cacheKey   = generarClaveCache({ q: query });
    const datosCache = cacheService.obtenerDeCache(cacheKey);

    if (datosCache) {
      logger.info({ reqId }, "[Premium] Cache HIT.");
      datosCache.respuesta     = mensajeParaUsuario;
      datosCache.nuevoContexto = JSON.stringify(busquedaBD);
      return datosCache;
    }

    const respuestaAPI = await apiRepository.consultarAPI({ q: query }, reqId);
    let resultadoFinal;

    if (!respuestaAPI.piezas || respuestaAPI.piezas.length === 0) {
      const cocheDesc = [busquedaBD.marca, busquedaBD.modelo, busquedaBD.ano].filter(Boolean).join(" ");
      const piezaDesc = busquedaBD.articulo || "esta pieza";

      resultadoFinal = {
        respuesta:     `He revisado el almacén buscando "${piezaDesc}" para "${cocheDesc}". Lamentablemente no tenemos stock disponible.\n\n¿Te puedo ayudar con otra pieza?`,
        piezas:        [],
        nuevoContexto: JSON.stringify(busquedaBD),
      };
    } else {
      const total       = parseInt(respuestaAPI.total) || respuestaAPI.piezas.length;
      const piezasTop   = respuestaAPI.piezas.slice(0, 4);
      const excedeLimite = total > LIMITE_GENERICO;

      resultadoFinal = {
        respuesta: mensajeParaUsuario,
        piezas:    formatearParaReact(piezasTop),
        metadata:  { totalReal: total, queryLimpia: query, excedeLimite },
        nuevoContexto: JSON.stringify(busquedaBD),
      };
    }

    cacheService.guardarEnCache(cacheKey, resultadoFinal);
    return resultadoFinal;

  } catch (error) {
    logger.error({ reqId, err: error }, `Error critico en aiService: ${error.message}. Activando fallback al modo FREE.`);

    // Si la IA falla (timeout, RunPod caído, JSON roto), caemos al sistema FREE.
    // Así el usuario siempre recibe una respuesta aunque sea sin IA premium.
    try {
      return await seleccionRespuesta(promptUsuario, contextoAnterior, reqId);
    } catch (fallbackError) {
      logger.error({ reqId, err: fallbackError }, "El fallback FREE tambien fallo.");
      return {
        respuesta: "Lo sentimos, el servicio no está disponible en este momento. Inténtalo de nuevo en unos segundos.",
        piezas: [],
        nuevoContexto: contextoAnterior,
      };
    }
  }
};

module.exports = { seleccionRespuestaPremium };