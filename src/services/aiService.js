const logger = require("../utils/logger");
const { getSystemPrompt } = require("../config/prompts");
const apiRepository = require("../repositories/apiRepository");
const cacheService = require("./cacheService");
const { formatearParaReact } = require("../utils/formateadorPiezasReact");
const { generarClaveCache } = require("../utils/cacheKeyGenerator");
const { fusionarContexto } = require("../utils/contextHelper");
const { seleccionRespuesta } = require("./chatService");
const { VALORES_NULOS } = require("../config/constants");
const { generarRespuestaUsuario, determinarCampoFaltante } = require("../utils/dialogHelper");
const { validarYCorregir } = require("../utils/correctorOrtografico");

const RUNPOD_IA_URL   = process.env.RUNPOD_IA_URL;
const RUNPOD_IA_TOKEN = process.env.RUNPOD_IA_TOKEN;
const RUNPOD_IA_MODEL = process.env.RUNPOD_IA_MODEL;
const AI_TEMPERATURE  = parseFloat(process.env.RUNPOD_AI_TEMPERATURE) || 0.0;
const AI_MAX_TOKENS   = parseInt(process.env.RUNPOD_IA_MAX_TOKENS) || 400;
const AI_SERVICE_TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS) || 30000;

// Schema de salida guiado para el vLLM: fuerza al modelo a devolver siempre este JSON.
const GUIDED_JSON_SCHEMA = {
  type: "object",
  properties: {
    respuesta_usuario:   { type: "string" },
    _razonamiento:       { type: "string" },
    es_busqueda:         { type: "boolean" },
    requiere_sugerencias:{ type: "boolean" },
    articulo:            { type: ["string", "null"] },
    referencia:          { type: ["string", "null"] },
    marca:               { type: ["string", "null"] },
    modelo:              { type: ["string", "null"] },
    ano:                 { type: ["string", "null"] },
    version:             { type: ["string", "null"] },
  },
  required: ["respuesta_usuario", "es_busqueda", "requiere_sugerencias"],
};

/**
 * Envía los prompts al servidor vLLM (RunPod) y devuelve el texto JSON generado.
 * Lanza un Error si la respuesta HTTP no es 2xx.
 * @param {string} promptSistema - System prompt con instrucciones y contexto del bot
 * @param {string} promptUsuario - Mensaje del usuario a procesar
 * @returns {Promise<string>} Texto JSON crudo devuelto por el modelo
 */
const llamarVLLM = async (promptSistema, promptUsuario) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS);

  try {
    const respuesta = await fetch(RUNPOD_IA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNPOD_IA_TOKEN}`,
      },
      body: JSON.stringify({
        model: RUNPOD_IA_MODEL,
        messages: [
          { role: "system", content: promptSistema },
          { role: "user",   content: promptUsuario },
        ],
        temperature: AI_TEMPERATURE,
        max_tokens: AI_MAX_TOKENS,
        response_format: { type: "json_object" },
        guided_json: GUIDED_JSON_SCHEMA,
      }),
      signal: controller.signal, // Add the AbortController signal
    });

    clearTimeout(timeoutId); // Clear the timeout if fetch completes

    if (!respuesta.ok) {
      const errorText = await respuesta.text();
      throw new Error(`vLLM falló: HTTP ${respuesta.status} - ${errorText}`);
    }

    const respuestaVLLM = await respuesta.json();
    return respuestaVLLM.choices[0].message.content.trim();
  } catch (error) {
    clearTimeout(timeoutId); // Ensure timeout is cleared on error as well
    if (error.name === 'AbortError') {
      throw new Error(`vLLM request timed out after ${AI_SERVICE_TIMEOUT_MS}ms`);
    }
    throw error;
  }
};

/**
 * Consulta la API de recambios, gestiona la caché y formatea el resultado para el frontend.
 * Encapsula la lógica de "sin stock" y "con stock" en un único punto de salida.
 * @param {Object} busquedaBD - Contexto completo de la búsqueda (articulo, marca, modelo, etc.)
 * @param {string} mensajeParaUsuario - Texto que acompañará los resultados en el chat
 * @param {string} reqId - ID de trazabilidad
 * @param {Object} cliente - Configuración del cliente (storeUrl, id, etc.)
 * @returns {Promise<Object>} Respuesta estructurada lista para el frontend
 */
const ejecutarBusquedaAPI = async (busquedaBD, mensajeParaUsuario, reqId, cliente) => {
  const query = Object.values(busquedaBD)
    .filter(val => val !== null && val !== VALORES_NULOS.STRING_NULL && val !== "")
    .join(" ");

  const cacheKey = generarClaveCache({ q: query, clienteId: cliente.id });
  const datosCache = cacheService.obtenerDeCache(cacheKey);

  if (datosCache) {
    logger.info({ reqId }, "Cache HIT.");
    if (datosCache.piezas?.length > 0) datosCache.respuesta = mensajeParaUsuario;
    datosCache.nuevoContexto    = JSON.stringify(busquedaBD);
    datosCache.pedirSugerencias = false;
    return datosCache;
  }

  const respuestaAPI = await apiRepository.consultarAPI({ q: query }, reqId, cliente);

  if (!respuestaAPI.piezas || respuestaAPI.piezas.length === 0) {
    const cocheDesc = [busquedaBD.marca, busquedaBD.modelo, busquedaBD.ano]
      .filter(Boolean).join(" ");
    return {
      respuesta: `He revisado el almacén buscando "${busquedaBD.articulo || "tu pieza"}" para "${cocheDesc || "el vehículo deseado"}". Pero actualmente no tenemos stock disponible.\n\n¿Buscas alguna otra pieza?`,
      piezas: [],
      sugerencias: [],
      pedirSugerencias: false,
      nuevoContexto: JSON.stringify(busquedaBD),
    };
  }

  const resultado = {
    respuesta: mensajeParaUsuario,
    piezas: formatearParaReact(respuestaAPI.piezas.slice(0, 4)),
    sugerencias: [],
    pedirSugerencias: false,
    metadata: { totalReal: respuestaAPI.total, queryLimpia: query },
    nuevoContexto: JSON.stringify(busquedaBD),
  };

  cacheService.guardarEnCache(cacheKey, resultado);
  return resultado;
};

/**
 * Motor Premium del chatbot (vLLM). Orquesta la llamada a la IA, la validación
 * de aduana, la fusión de contexto y la búsqueda en la API de recambios.
 * En caso de fallo total, hace fallback al motor Free (NLP local).
 *
 * @param {string} promptUsuario - Mensaje del usuario
 * @param {string} contextoAnterior - JSON serializado del contexto previo de la sesión
 * @param {string} reqId - ID de trazabilidad para logs
 * @param {Object} cliente - Configuración del cliente (storeUrl, etc.)
 * @returns {Promise<Object>} Respuesta estructurada con texto, piezas y nuevo contexto
 */
const seleccionRespuestaPremium = async (
  promptUsuario,
  contextoAnterior = "",
  reqId = "test",
  cliente
) => {
  try {
    logger.info({ reqId }, `Iniciando petición a vLLM (Modelo: ${RUNPOD_IA_MODEL})...`);

    let contextoAnteriorParsed = {};
    try {
      contextoAnteriorParsed = typeof contextoAnterior === "string"
        ? JSON.parse(contextoAnterior)
        : (contextoAnterior || {});
    } catch (_) {
      logger.warn({ reqId }, "No se pudo parsear contextoAnterior, se usará objeto vacío.");
    }

    const campoQueFalta = determinarCampoFaltante(contextoAnteriorParsed);
    const promptDelSistema   = getSystemPrompt(cliente.storeUrl, contextoAnterior, campoQueFalta, promptUsuario);
    const textoRespuestaIA   = await llamarVLLM(promptDelSistema, promptUsuario);

    let intentExtraido;
    let mensajeParaUsuario = "";
    let busquedaBD         = null;
    let debeBuscarEnBD     = false;

    try {
      intentExtraido = JSON.parse(textoRespuestaIA);

      // Si el LLM ha logrado extraer ALGÚN dato, ignoramos requiere_sugerencias
      // para forzar que el dato pase por la Aduana y siga el flujo de búsqueda.
      const tieneCamposExtraidosBruto = !!(
        intentExtraido.articulo || intentExtraido.marca || intentExtraido.modelo ||
        intentExtraido.ano || intentExtraido.version || intentExtraido.referencia
      );

      // El LLM a veces serializa booleanos como strings — normalizamos antes de usarlos.
      const requiereSugerencias =
        (intentExtraido.requiere_sugerencias === true ||
        intentExtraido.requiere_sugerencias === "true") && !tieneCamposExtraidosBruto;

      // ── CASO A (PRIORIDAD MÁXIMA): El usuario está bloqueado o no sabe un dato ──
      // Se evalúa ANTES de la aduana. Así, frases de desconocimiento como "no lo sé"
      // o "ni idea" nunca llegan al validador léxico aunque el LLM las haya puesto
      // en un campo técnico. Usamos contextoAnteriorParsed (el estado real confirmado),
      // ignorando por completo el JSON del LLM para obtener los datos de búsqueda.
      if (requiereSugerencias) {
        logger.info({ reqId }, "requiere_sugerencias activo. Consultando BD para obtener opciones...");
        const campoFaltante = determinarCampoFaltante(contextoAnteriorParsed);
        const sugerencias   = campoFaltante
          ? await apiRepository.obtenerSugerencias(contextoAnteriorParsed, campoFaltante, cliente)
          : [];
        logger.info({ reqId }, `Sugerencias obtenidas: ${sugerencias.length} opciones para '${campoFaltante}'.`);

        return {
          respuesta:      intentExtraido.respuesta_usuario || generarRespuestaUsuario(contextoAnteriorParsed),
          piezas:         [],
          sugerencias,
          campoFaltante,
          pedirSugerencias: false,
          metadata:       { totalReal: 0, queryLimpia: "" },
          // El contexto no avanza: el usuario no aportó datos técnicos válidos.
          nuevoContexto:  typeof contextoAnterior === "string"
            ? contextoAnterior
            : JSON.stringify(contextoAnterior || {}),
        };
      }

      // ── Aduana: valida ortografía y existencia de marcas/artículos ──────────
      // Solo se ejecuta cuando el usuario SÍ ha aportado datos técnicos.
      const tieneCamposExtraidos = !!(intentExtraido.articulo || intentExtraido.marca || intentExtraido.modelo);
      let resultadoValidacion = { error: false, contextoCorregido: intentExtraido };

      if (intentExtraido.es_busqueda || tieneCamposExtraidos) {
        resultadoValidacion = validarYCorregir(intentExtraido);

        if (resultadoValidacion.error) {
          logger.warn({ reqId }, `Aduana bloqueó la petición: ${resultadoValidacion.mensaje}`);
          return {
            respuesta:      resultadoValidacion.mensaje,
            piezas:         [],
            sugerencias:    [],
            campoFaltante:  determinarCampoFaltante(contextoAnteriorParsed),
            pedirSugerencias: false,
            metadata:       { totalReal: 0, queryLimpia: "" },
            nuevoContexto:  typeof contextoAnterior === "string"
              ? contextoAnterior
              : JSON.stringify(contextoAnterior || {}),
          };
        }
      }

      // ── Fusión de memoria: combina el contexto previo con los datos nuevos ──
      const { contexto: contextoFusionado, realizarBusqueda } = fusionarContexto(
        contextoAnterior,
        resultadoValidacion.contextoCorregido
      );

      // ── Caso B: Flujo normal — búsqueda en BD o respuesta conversacional ────
      busquedaBD = contextoFusionado;
      const tieneDatosEnMemoria = !!(
        busquedaBD.articulo || busquedaBD.marca || busquedaBD.modelo || busquedaBD.referencia
      );
      debeBuscarEnBD = (intentExtraido.es_busqueda || tieneDatosEnMemoria) && realizarBusqueda;

      if (!debeBuscarEnBD) {
        const frasesConversacion = [
          intentExtraido.respuesta_usuario || "¿En qué te puedo ayudar hoy?",
          "Dime, ¿qué necesitas para tu coche?",
          "¡Hola! Cuéntame, ¿qué pieza estás buscando?",
          "Estoy aquí para ayudarte, ¿buscamos alguna pieza?",
        ];
        mensajeParaUsuario = frasesConversacion[Math.floor(Math.random() * frasesConversacion.length)];
        logger.info({ reqId }, "Modo Conversación / Datos insuficientes.");
      } else {
        mensajeParaUsuario = generarRespuestaUsuario(busquedaBD);
      }

    } catch (errorParseIA) {
      logger.error({ reqId, err: errorParseIA }, "Error procesando JSON de la IA.");
      mensajeParaUsuario = textoRespuestaIA;
    }

    // ── Seguro de cascada: bloquea la búsqueda si faltan datos mínimos ────────
    // Una búsqueda sin artículo+marca+modelo+año devolvería miles de resultados irrelevantes.
    if (debeBuscarEnBD && busquedaBD) {
      const cascadaCompleta =
        busquedaBD.articulo && busquedaBD.marca && busquedaBD.modelo && busquedaBD.ano;
      const tieneReferencia = !!busquedaBD.referencia;

      if (!cascadaCompleta && !tieneReferencia) {
        logger.warn({ reqId }, "Búsqueda bloqueada: faltan datos para la cascada completa.");
        debeBuscarEnBD     = false;
        mensajeParaUsuario = generarRespuestaUsuario(busquedaBD);
      }
    }

    if (!debeBuscarEnBD) {
      const campoFaltante = determinarCampoFaltante(busquedaBD || {});
      logger.info({ reqId }, `Flujo normal — siguiente campo: '${campoFaltante}'.`);
      return {
        respuesta:      mensajeParaUsuario,
        piezas:         [],
        sugerencias:    [],
        campoFaltante,
        pedirSugerencias: false,
        metadata:       { totalReal: 0, queryLimpia: "" },
        nuevoContexto:  JSON.stringify(busquedaBD || {}),
      };
    }

    return await ejecutarBusquedaAPI(busquedaBD, mensajeParaUsuario, reqId, cliente);

  } catch (error) {
    logger.error({ reqId, err: error }, "Error en modo Premium. Fallback a modo FREE.");
    try {
      return await seleccionRespuesta(promptUsuario, contextoAnterior, reqId, cliente);
    } catch (fallbackError) {
      return {
        respuesta:     "Servicio temporalmente no disponible.",
        piezas:        [],
        sugerencias:   [],
        nuevoContexto: contextoAnterior,
      };
    }
  }
};

module.exports = { seleccionRespuestaPremium };