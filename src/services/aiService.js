const logger = require("../utils/logger");
const { getRouterPrompt, getExtractorPrompt } = require("../config/prompts");
const apiRepository = require("../repositories/apiRepository");
const cacheService = require("./cacheService");
const { formatearParaReact } = require("../utils/formateadorPiezasReact");
const { generarClaveCache } = require("../utils/cacheKeyGenerator");
const { fusionarContexto } = require("../utils/contextHelper");
const { seleccionRespuesta } = require("./chatService");
const { VALORES_NULOS } = require("../config/constants");
const { generarRespuestaUsuario, determinarCampoFaltante } = require("../utils/dialogHelper");
const { validarYCorregir } = require("../utils/correctorOrtografico");
const { validarVehiculo, inferirMarcaDeModelo } = require("../utils/validadorVehiculo");

const RUNPOD_IA_URL   = process.env.RUNPOD_IA_URL;
const RUNPOD_IA_TOKEN = process.env.RUNPOD_IA_TOKEN;
const RUNPOD_IA_MODEL = process.env.RUNPOD_IA_MODEL;
const AI_TEMPERATURE  = parseFloat(process.env.RUNPOD_AI_TEMPERATURE) || 0.0;
const AI_MAX_TOKENS   = parseInt(process.env.RUNPOD_IA_MAX_TOKENS) || 400;
const AI_SERVICE_TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS) || 30000;

// Schema para el enrutador
const ROUTER_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["busqueda", "ayuda", "conversacion", "agente"] },
    respuesta_conversacion: { type: ["string", "null"] },
    reset: { type: ["boolean", "null"] }
  },
  required: ["intent"]
};

// Schema para el extractor
const EXTRACTOR_SCHEMA = {
  type: "object",
  properties: {
    _razonamiento:       { type: "string" },
    afirmacion_simple:   { type: "boolean" },
    negacion_simple:     { type: "boolean" },
    articulo:            { type: ["string", "null"] },
    referencia:          { type: ["string", "null"] },
    marca:               { type: ["string", "null"] },
    modelo:              { type: ["string", "null"] },
    ano:                 { type: ["string", "null"] },
    version:             { type: ["string", "null"] },
  },
  required: ["_razonamiento", "afirmacion_simple", "negacion_simple"]
};

/**
 * Envía los prompts al servidor vLLM (RunPod) y devuelve el texto JSON generado.
 * Lanza un Error si la respuesta HTTP no es 2xx.
 * @param {string} promptSistema - System prompt con instrucciones y contexto del bot
 * @param {string} promptUsuario - Mensaje del usuario a procesar
 * @param {Object} guidedSchema - Esquema JSON para forzar el formato
 * @returns {Promise<string>} Texto JSON crudo devuelto por el modelo
 */
const llamarVLLM = async (promptSistema, promptUsuario, guidedSchema) => {
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
        guided_json: guidedSchema,
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
    const cocheDesc = [busquedaBD.marca, busquedaBD.modelo, busquedaBD.ano, busquedaBD.version]
      .filter(Boolean).join(" ");
    return {
      respuesta: `Lo sentimos, ahora mismo no tenemos "${busquedaBD.articulo || "esa pieza"}" para "${cocheDesc || "ese vehículo"}" en stock.\nTe proporciono el contacto de un agente que pueda ayudarte.`,
      piezas: [],
      sugerencias: [],
      pedirSugerencias: false,
      pedirWhatsapp: true,
      nuevoContexto: "",
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

    const campoFaltante = determinarCampoFaltante(contextoAnteriorParsed);

    // 0. CORTOCIRCUITO: detección determinista de referencia OEM sin pasar por el router.
    //    Regla: mensaje que, quitando espacios y guiones, es alfanumérico puro y tiene ≥5 chars,
    //    Y contiene al menos un dígito (descarta palabras sueltas) Y no es un año de 4 dígitos.
    //    Además: en mensajes con espacios, ninguna palabra suelta puede ser texto puro (≥3 letras sin dígitos),
    //    lo que distingue "1K0 698 151" (OEM partido) de "GOLF VII BERLINA BQ1BE2" (versión con texto).
    const mensajeLimpio = promptUsuario.trim().replace(/[\s\-]/g, "");
    const palabras = promptUsuario.trim().split(/\s+/);
    const tieneTokenTexto = palabras.some(p => p.length >= 3 && /^[A-Za-z]+$/.test(p));
    const esOEM = /^[A-Za-z0-9]{5,}$/.test(mensajeLimpio)   // solo letras+números, ≥5 chars
      && /\d/.test(mensajeLimpio)                             // tiene al menos un dígito
      && !/^(19|20)\d{2}$/.test(mensajeLimpio)               // no es un año tipo 1980-2099
      && !tieneTokenTexto;                                    // no contiene palabras de texto puro
    if (esOEM) {
      logger.info({ reqId }, `Cortocircuito OEM: "${promptUsuario}" → referencia detectada sin router.`);
      const contextoOEM = { articulo: null, marca: null, modelo: null, ano: null, version: null, referencia: mensajeLimpio };
      return await ejecutarBusquedaAPI(contextoOEM, `Buscando por referencia OEM: ${mensajeLimpio}`, reqId, cliente);
    }

    // 1. LLAMADA AL ENRUTADOR
    const routerPrompt = getRouterPrompt(campoFaltante);
    const textoRespuestaRouter = await llamarVLLM(routerPrompt, promptUsuario, ROUTER_SCHEMA);
    
    let routerResponse;
    try {
      routerResponse = JSON.parse(textoRespuestaRouter);
    } catch (e) {
      logger.error({ reqId, err: e }, "Error procesando JSON del enrutador.");
      routerResponse = { intent: "busqueda" };
    }

    // Caso 1: Conversación (incluye posible reset de contexto)
    if (routerResponse.intent === "conversacion") {
      logger.info({ reqId }, "Enrutador detectó conversación.");
      const esReset = routerResponse.reset === true;
      if (esReset) logger.info({ reqId }, "Reset de conversación solicitado por el usuario.");

      const textoConversacion = routerResponse.respuesta_conversacion || "¿En qué te puedo ayudar hoy?";
      // Si la respuesta incluye un enlace a WhatsApp, señalamos al frontend que muestre el botón
      const contieneWhatsApp = textoConversacion.includes("[[WHATSAPP]]") || textoConversacion.includes("[→ WhatsApp]");
      const textoLimpio = textoConversacion.replace(/\[\[WHATSAPP\]\]/g, "").replace(/\[→ WhatsApp\]/g, "").trim();
      return {
        respuesta: textoLimpio,
        piezas: [],
        sugerencias: [],
        campoFaltante: esReset ? null : campoFaltante,
        pedirSugerencias: false,
        pedirWhatsapp: contieneWhatsApp,
        reset: esReset,
        metadata: { totalReal: 0, queryLimpia: "" },
        nuevoContexto: esReset ? "" : (typeof contextoAnterior === "string" ? contextoAnterior : JSON.stringify(contextoAnteriorParsed)),
      };
    }

    // Caso Agente: Derivación a Humano / WhatsApp
    if (routerResponse.intent === "agente") {
      logger.info({ reqId }, "Enrutador detectó derivación a agente humano.");
      return {
        respuesta: "TRIGGER_WHATSAPP",
        piezas: [],
        sugerencias: [],
        campoFaltante,
        pedirSugerencias: false,
        metadata: { totalReal: 0, queryLimpia: "" },
        nuevoContexto: typeof contextoAnterior === "string" ? contextoAnterior : JSON.stringify(contextoAnteriorParsed),
      };
    }

    // Caso 2: Ayuda / Bloqueo
    if (routerResponse.intent === "ayuda") {
      logger.info({ reqId }, "Enrutador detectó ayuda/bloqueo. Consultando BD para obtener opciones...");
      const sugerencias = campoFaltante
        ? await apiRepository.obtenerSugerencias(contextoAnteriorParsed, campoFaltante, cliente)
        : [];
      logger.info({ reqId }, `Sugerencias obtenidas: ${sugerencias.length} opciones para '${campoFaltante}'.`);

      if (sugerencias.length === 0) {
        return {
          respuesta: "Lo siento, no he encontrado opciones disponibles para lo que buscas actualmente. ¿Podrías revisar el vehículo proporcionado?",
          piezas: [],
          sugerencias: [],
          pedirWhatsapp: true,
          campoFaltante,
          pedirSugerencias: false,
          metadata: { totalReal: 0, queryLimpia: "" },
          nuevoContexto: typeof contextoAnterior === "string" ? contextoAnterior : JSON.stringify(contextoAnteriorParsed),
        };
      }

      return {
        respuesta: "¡No te preocupes! Aquí tienes unas opciones:",
        piezas: [],
        sugerencias,
        campoFaltante,
        pedirSugerencias: true,
        metadata: { totalReal: 0, queryLimpia: "" },
        nuevoContexto: typeof contextoAnterior === "string" ? contextoAnterior : JSON.stringify(contextoAnteriorParsed),
      };
    }

    // Caso 3: Búsqueda / Extracción de Datos
    logger.info({ reqId }, "Enrutador detectó búsqueda. Llamando al Extractor...");
    const extractorPrompt = getExtractorPrompt(cliente.storeUrl, campoFaltante);
    const textoRespuestaExtractor = await llamarVLLM(extractorPrompt, promptUsuario, EXTRACTOR_SCHEMA);
    
    let datosExtraidos;
    try {
      datosExtraidos = JSON.parse(textoRespuestaExtractor);
    } catch (e) {
      logger.error({ reqId, err: e }, "Error procesando JSON del extractor.");
      datosExtraidos = {};
    }

    // Blindaje de versión: cuando el campo pendiente era "version", el extractor NO debe
    // cambiar el modelo (podría extraer "VII" de "GOLF VII BERLINA BQ1BE2" y resetear el año).
    // Forzamos modelo=null y nos aseguramos de que la versión tenga valor.
    if (campoFaltante === "version") {
      datosExtraidos.modelo = null;
      datosExtraidos.marca  = null;
      if (!datosExtraidos.version) {
        datosExtraidos.version = promptUsuario.trim();
      }
    }

    // Aduana: valida ortografía y existencia de marcas/artículos
    let resultadoValidacion = validarYCorregir(datosExtraidos);

    if (resultadoValidacion.error) {
      logger.warn({ reqId }, `Aduana bloqueó la petición: ${resultadoValidacion.mensaje}`);
      
      // SOLUCIÓN AMNESIA: Fusionar lo que sí era válido (ej: marca/modelo) con el contexto anterior,
      // para no olvidar el coche si el usuario falla en el nombre de la pieza.
      const { contexto: contextoParcial } = fusionarContexto(contextoAnterior, resultadoValidacion.contextoCorregido);

      return {
        respuesta: resultadoValidacion.mensaje,
        piezas: [],
        sugerencias: [],
        campoFaltante,
        pedirSugerencias: false,
        metadata: { totalReal: 0, queryLimpia: "" },
        nuevoContexto: JSON.stringify(contextoParcial),
      };
    }

    // Fusión de memoria: combina el contexto previo con los datos nuevos
    const { contexto: contextoFusionado, realizarBusqueda } = fusionarContexto(
      contextoAnterior,
      resultadoValidacion.contextoCorregido
    );

    let busquedaBD = contextoFusionado;

    // Inferencia automática de marca: si hay modelo pero no marca,
    // intentamos deducirla del catálogo. Solo se asigna si es inequívoca (1 sola marca).
    if (!busquedaBD.marca && busquedaBD.modelo) {
      const marcaInferida = inferirMarcaDeModelo(busquedaBD.modelo);
      if (marcaInferida) {
        logger.info({ reqId }, `Marca inferida automáticamente: "${busquedaBD.modelo}" → "${marcaInferida}"`);
        busquedaBD = { ...busquedaBD, marca: marcaInferida.toLowerCase() };
      }
    }

    // Validación de coherencia marca↔modelo contra el catálogo real (CSV).
    // Caza casos como "seat laguna" (Laguna es Renault) sin bloquear modelos válidos.
    if (busquedaBD.marca && busquedaBD.modelo) {
      const { marcaReconocida, modeloCoherente } = validarVehiculo(busquedaBD.marca, busquedaBD.modelo);
      if (marcaReconocida && !modeloCoherente) {
        logger.warn({ reqId }, `Incoherencia vehículo: "${busquedaBD.modelo}" no pertenece a "${busquedaBD.marca}".`);
        const modeloErroneo = busquedaBD.modelo;
        // Conservamos la marca, descartamos el modelo inválido para que el usuario lo reescriba.
        busquedaBD.modelo = null;
        busquedaBD.ano = null;
        busquedaBD.version = null;
        return {
          respuesta: `No encuentro el modelo "${modeloErroneo}" dentro de ${busquedaBD.marca}. ¿Podrías confirmarme el modelo correcto?`,
          piezas: [],
          sugerencias: [],
          campoFaltante: "modelo",
          pedirSugerencias: false,
          metadata: { totalReal: 0, queryLimpia: "" },
          nuevoContexto: JSON.stringify(busquedaBD),
        };
      }
    }

    const tieneDatosEnMemoria = !!(
      busquedaBD.articulo || busquedaBD.marca || busquedaBD.modelo || busquedaBD.referencia
    );
    let debeBuscarEnBD = tieneDatosEnMemoria && realizarBusqueda;
    let mensajeParaUsuario = "";

    // Seguro de cascada: bloquea la búsqueda si faltan datos mínimos
    if (debeBuscarEnBD && busquedaBD) {
      const cascadaCompleta =
        busquedaBD.articulo && busquedaBD.marca && busquedaBD.modelo && busquedaBD.ano;
      const tieneReferencia = !!busquedaBD.referencia;

      if (!cascadaCompleta && !tieneReferencia) {
        logger.warn({ reqId }, "Búsqueda bloqueada: faltan datos para la cascada completa.");
        debeBuscarEnBD = false;
      }
    }
    
    mensajeParaUsuario = generarRespuestaUsuario(busquedaBD);

    if (!debeBuscarEnBD) {
      const nuevoCampoFaltante = determinarCampoFaltante(busquedaBD || {});
      logger.info({ reqId }, `Flujo normal — siguiente campo: '${nuevoCampoFaltante}'.`);
      return {
        respuesta: mensajeParaUsuario,
        piezas: [],
        sugerencias: [],
        campoFaltante: nuevoCampoFaltante,
        pedirSugerencias: false,
        metadata: { totalReal: 0, queryLimpia: "" },
        nuevoContexto: JSON.stringify(busquedaBD || {}),
      };
    }

    return await ejecutarBusquedaAPI(busquedaBD, mensajeParaUsuario, reqId, cliente);

  } catch (error) {
    logger.error({ reqId, err: error }, "Error en modo Premium. Fallback a modo FREE.");
    try {
      return await seleccionRespuesta(promptUsuario, contextoAnterior, reqId, cliente);
    } catch (fallbackError) {
      return {
        respuesta: "Servicio temporalmente no disponible.",
        piezas: [],
        sugerencias: [],
        nuevoContexto: contextoAnterior,
      };
    }
  }
};

module.exports = { seleccionRespuestaPremium };