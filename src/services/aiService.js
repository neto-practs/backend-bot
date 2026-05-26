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

const RUNPOD_IA_URL = process.env.RUNPOD_IA_URL;
const RUNPOD_IA_TOKEN = process.env.RUNPOD_IA_TOKEN;
const RUNPOD_IA_MODEL = process.env.RUNPOD_IA_MODEL;
const AI_TEMPERATURE = parseFloat(process.env.RUNPOD_AI_TEMPERATURE) || 0.0;
const AI_MAX_TOKENS = parseInt(process.env.RUNPOD_IA_MAX_TOKENS) || 400;

// Esquema guiado para el vLLM: define la estructura exacta del JSON de salida.
const GUIDED_JSON_SCHEMA = {
  type: "object",
  properties: {
    respuesta_usuario: { type: "string" },
    _razonamiento: { type: "string" },
    es_busqueda: { type: "boolean" },
    requiere_sugerencias: { type: "boolean" },
    articulo: { type: ["string", "null"] },
    referencia: { type: ["string", "null"] },
    marca: { type: ["string", "null"] },
    modelo: { type: ["string", "null"] },
    ano: { type: ["string", "null"] },
    version: { type: ["string", "null"] },
  },
  required: ["respuesta_usuario", "es_busqueda", "requiere_sugerencias"],
};

// Función auxiliar para aportar variedad conversacional
const getRandom = (array) => array[Math.floor(Math.random() * array.length)];

const seleccionRespuestaPremium = async (
  promptUsuario,
  contextoAnterior = "",
  reqId = "test",
  cliente
) => {
  try {
    logger.info({ reqId }, `Iniciando peticion a vLLM (Modelo: ${RUNPOD_IA_MODEL})...`);

    // Inyectamos el contexto de conversaciones anteriores en el prompt
    const promptDelSistema = getSystemPrompt(cliente.storeUrl, contextoAnterior);

    const response = await fetch(RUNPOD_IA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNPOD_IA_TOKEN}`,
      },
      body: JSON.stringify({
        model: RUNPOD_IA_MODEL,
        messages: [
          { role: "system", content: promptDelSistema },
          { role: "user", content: promptUsuario },
        ],
        temperature: AI_TEMPERATURE,
        max_tokens: AI_MAX_TOKENS,
        response_format: { type: "json_object" },
        guided_json: GUIDED_JSON_SCHEMA,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`vLLM fallo: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textoFinal = data.choices[0].message.content.trim();

    let intentExtraido = null;
    let mensajeParaUsuario = "";
    let busquedaBD = null;
    let quiereBuscar = false;

    try {
      intentExtraido = JSON.parse(textoFinal);

      // Normalización de tipos por si el LLM devuelve strings en lugar de booleanos
      const requiereSugerencias = intentExtraido.requiere_sugerencias === true || intentExtraido.requiere_sugerencias === "true";

      // PASO 1: Validación de Aduana (Ortografía y Existencia)
      // Solo validamos si hay algo que validar (búsqueda activa o campos extraídos)
      const tieneCamposExtraidos = !!(intentExtraido.articulo || intentExtraido.marca || intentExtraido.modelo);
      let resultadoValidacion = { error: false, contextoCorregido: intentExtraido };

      if (intentExtraido.es_busqueda || tieneCamposExtraidos) {
        resultadoValidacion = validarYCorregir(intentExtraido);
        
        // Si la aduana detecta un error (marca mcdonalds, etc.), cortamos aquí.
        if (resultadoValidacion.error) {
          logger.warn({ reqId }, `Aduana bloqueó la petición: ${resultadoValidacion.mensaje}`);
          
          let ctxAnteriorParsed = {};
          try { ctxAnteriorParsed = typeof contextoAnterior === "string" ? JSON.parse(contextoAnterior) : (contextoAnterior || {}); } catch(_) {}

          return {
            respuesta: resultadoValidacion.mensaje,
            piezas: [],
            sugerencias: [],
            campoFaltante: determinarCampoFaltante(ctxAnteriorParsed),
            pedirSugerencias: false,
            metadata: { totalReal: 0, queryLimpia: "" },
            nuevoContexto: typeof contextoAnterior === "string" ? contextoAnterior : JSON.stringify(contextoAnterior || {})
          };
        }
      }

      // PASO 2: Fusión de memoria
      const { contexto: contextoFusionado, realizarBusqueda: rb } = fusionarContexto(
        contextoAnterior,
        resultadoValidacion.contextoCorregido
      );

      // 🎯 CASO A: SUGERENCIAS EXPLÍCITAS (Usuario bloqueado o pide ayuda)
      if (requiereSugerencias) {
        logger.info({ reqId }, "[Bot] requiere_sugerencias activo. Consultando BD para obtener opciones...");
        
        const campoFaltante = determinarCampoFaltante(contextoFusionado);

        // Priorizamos la respuesta que redactó la IA (más natural si el usuario pidió ayuda)
        const mensajeFinal = intentExtraido.respuesta_usuario || generarRespuestaUsuario(contextoFusionado);

        // Llamada real a la BD — basada en la "q" actual (contextoFusionado)
        const sugerencias = campoFaltante
          ? await apiRepository.obtenerSugerencias(contextoFusionado, campoFaltante, cliente)
          : [];

        logger.info({ reqId }, `[Bot] Sugerencias obtenidas: ${sugerencias.length} opciones para '${campoFaltante}'.`);

        return {
          respuesta: mensajeFinal,
          piezas: [],
          sugerencias,
          campoFaltante,
          pedirSugerencias: false, 
          metadata: { totalReal: 0, queryLimpia: "" },
          nuevoContexto: JSON.stringify(contextoFusionado), 
        };
      }

      // 🎯 CASO B: FLUJO NORMAL (Búsqueda o Conversación)
      busquedaBD = contextoFusionado;
      
      const tieneDatosEnMemoria = !!(busquedaBD.articulo || busquedaBD.marca || busquedaBD.modelo || busquedaBD.referencia);
      quiereBuscar = (intentExtraido.es_busqueda || tieneDatosEnMemoria) && rb;

      if (!quiereBuscar) {
        // Modo conversación o incompleto
        const posiblesRespuestasCharla = [
          intentExtraido.respuesta_usuario || "¿En qué te puedo ayudar hoy?",
          "Dime, ¿qué necesitas para tu coche?",
          "¡Hola! Cuéntame, ¿qué pieza estás buscando?",
          "Estoy aquí para ayudarte, ¿buscamos alguna pieza?"
        ];
        mensajeParaUsuario = getRandom(posiblesRespuestasCharla);
        logger.info({ reqId }, "Modo Conversación / Datos insuficientes.");
      } else {
        // Modo búsqueda: El dialogHelper toma el control de las preguntas basadas en la memoria
        mensajeParaUsuario = generarRespuestaUsuario(busquedaBD);
      }
    } catch (e) {
      logger.error({ reqId, err: e }, "Error procesando JSON de la IA.");
      mensajeParaUsuario = textoFinal;
    }

    // Validación de mínimos (Seguro de cascada)
    if (quiereBuscar && busquedaBD) {
      const tieneCascadaCompleta =
        busquedaBD.articulo &&
        busquedaBD.marca &&
        busquedaBD.modelo &&
        busquedaBD.ano;

      const tieneReferencia = !!busquedaBD.referencia;

      // Se bloquea la consulta a BBDD si no se cumplen los requisitos mínimos
      if (!tieneCascadaCompleta && !tieneReferencia) {
        logger.warn({ reqId }, "Busqueda bloqueada: Faltan datos para la cascada completa.");
        quiereBuscar = false;
        mensajeParaUsuario = generarRespuestaUsuario(busquedaBD);
      }
    }

    // Retorno temprano: cascada incompleta, flujo NORMAL.
    if (!quiereBuscar) {
      const campoFaltante = determinarCampoFaltante(busquedaBD || {});
      logger.info({ reqId }, `[Bot] Flujo normal — siguiente campo: '${campoFaltante}'. Sin sugerencias.`);

      return {
        respuesta: mensajeParaUsuario,
        piezas: [],
        sugerencias: [],
        campoFaltante,
        pedirSugerencias: false,
        metadata: { totalReal: 0, queryLimpia: "" },
        nuevoContexto: JSON.stringify(busquedaBD || {}),
      };
    }

    // Ejecución de la búsqueda en la API
    const query = Object.values(busquedaBD)
      .filter((val) => val !== null && val !== VALORES_NULOS.STRING_NULL && val !== "")
      .join(" ");

    const cacheKey = generarClaveCache({ q: query, clienteId: cliente.id });
    const datosCache = cacheService.obtenerDeCache(cacheKey);

    if (datosCache) {
      logger.info({ reqId }, "Cache HIT.");
      if (datosCache.piezas && datosCache.piezas.length > 0) {
        datosCache.respuesta = mensajeParaUsuario;
      }
      datosCache.nuevoContexto = JSON.stringify(busquedaBD);
      datosCache.pedirSugerencias = false;
      return datosCache;
    }

    const respuestaAPI = await apiRepository.consultarAPI({ q: query }, reqId, cliente);
    let resultadoFinal;

    if (!respuestaAPI.piezas || respuestaAPI.piezas.length === 0) {
      const cocheDesc = [busquedaBD.marca, busquedaBD.modelo, busquedaBD.ano].filter(Boolean).join(" ");
      resultadoFinal = {
        respuesta: `He revisado el almacén buscando "${busquedaBD.articulo || "tu pieza"}" para "${cocheDesc || "el vehiculo deseado"}". Pero actualmente no tenemos stock disponible.\n\n¿Buscas alguna otra pieza?`,
        piezas: [],
        sugerencias: [],
        pedirSugerencias: false,
        nuevoContexto: JSON.stringify(busquedaBD),
      };
    } else {
      resultadoFinal = {
        respuesta: mensajeParaUsuario,
        piezas: formatearParaReact(respuestaAPI.piezas.slice(0, 4)),
        sugerencias: [],
        pedirSugerencias: false,
        metadata: { totalReal: respuestaAPI.total, queryLimpia: query },
        nuevoContexto: JSON.stringify(busquedaBD),
      };
    }

    cacheService.guardarEnCache(cacheKey, resultadoFinal);
    return resultadoFinal;
  } catch (error) {
    logger.error({ reqId, err: error }, `Fallback a modo FREE.`);
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