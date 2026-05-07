const logger = require("../utils/logger");
const { getSystemPrompt } = require("../config/prompts");
const apiRepository = require("../repositories/apiRepository");
const cacheService = require("./cacheService");
const { formatearParaReact } = require("../utils/formateadorPiezasReact");
const { generarClaveCache } = require("../utils/cacheKeyGenerator");
const { fusionarContexto } = require("../utils/contextHelper");
const { seleccionRespuesta } = require("./chatService");
const { VALORES_NULOS } = require("../config/constants");
const { generarRespuestaUsuario } = require("../utils/dialogHelper");

const RUNPOD_IA_URL = process.env.RUNPOD_IA_URL;
const RUNPOD_IA_TOKEN = process.env.RUNPOD_IA_TOKEN;
const RUNPOD_IA_MODEL = process.env.RUNPOD_IA_MODEL;
const AI_TEMPERATURE = parseFloat(process.env.RUNPOD_AI_TEMPERATURE) || 0.0;
const AI_MAX_TOKENS = parseInt(process.env.RUNPOD_IA_MAX_TOKENS) || 400;


// Esquema simplificado para extracción pura (Limpiado tras el nuevo plan)
const GUIDED_JSON_SCHEMA = {
  type: "object",
  properties: {
    respuesta_usuario: { type: "string" },
    _razonamiento: { type: "string" },
    es_busqueda: { type: "boolean" },
    articulo: { type: ["string", "null"] },
    referencia: { type: ["string", "null"] },
    marca: { type: ["string", "null"] },
    modelo: { type: ["string", "null"] },
    ano: { type: ["string", "null"] },
    version: { type: ["string", "null"] },
  },
  required: ["respuesta_usuario", "es_busqueda"],
};

const seleccionRespuestaPremium = async (
  promptUsuario,
  contextoAnterior = "",
  reqId = "test", 
  cliente
) => {
  try {
    logger.info(
      { reqId },
      `Iniciando peticion a vLLM (Modelo: ${RUNPOD_IA_MODEL})...`,
    );

    // Le pasamos el contexto anterior al prompt para que la IA no trabaje a ciegas
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

      // Si la IA ha sacado cualquier dato válido, forzamos la búsqueda sí o sí.
      const tieneAlgunDato = intentExtraido.articulo || intentExtraido.marca || intentExtraido.modelo || intentExtraido.ano || intentExtraido.version || intentExtraido.referencia;
      if (tieneAlgunDato) {
        intentExtraido.es_busqueda = true;
      }

      // APLICAR LÓGICA DE CASCADA ESTRICTA
      const { contexto, realizarBusqueda } = fusionarContexto(
        contextoAnterior,
        intentExtraido,
      );

      busquedaBD = contexto;
      quiereBuscar = intentExtraido.es_busqueda && realizarBusqueda;

      if (!intentExtraido.es_busqueda) {
        // MODO CHARLA PURO: Solo entra aquí si no hay absolutamente ningún dato de coche
        mensajeParaUsuario = intentExtraido.respuesta_usuario || "Dime, ¿en qué más te puedo ayudar?";
        logger.info({ reqId }, "Modo Conversación. Habla la IA.");
      } else {
        // MODO BÚSQUEDA: IGNORAMOS EL TEXTO DE LA IA SIEMPRE.
        mensajeParaUsuario = generarRespuestaUsuario(busquedaBD);
      }
    } catch (e) {
      logger.error({ reqId, err: e }, "Error procesando JSON de la IA.");
      mensajeParaUsuario = textoFinal;
    }

    // Validación de mínimos para búsqueda
    if (quiereBuscar && busquedaBD) {
      const tieneTridente =
        busquedaBD.articulo && busquedaBD.marca && busquedaBD.modelo;
      const tieneReferencia = !!busquedaBD.referencia;

      if (!tieneTridente && !tieneReferencia) {
        logger.warn(
          { reqId },
          "Busqueda bloqueada por falta de datos minimos.",
        );
        quiereBuscar = false;
        // Volvemos a asegurar que pregunte lo que falta en lugar de imprimir "Datos extraídos"
        mensajeParaUsuario = generarRespuestaUsuario(busquedaBD);
      }
    }

    if (!quiereBuscar) {
      return {
        respuesta: mensajeParaUsuario,
        piezas: [],
        nuevoContexto: JSON.stringify(busquedaBD || {}),
      };
    }

    // Proceder con la búsqueda en la base de datos
    const query = Object.values(busquedaBD)
      .filter(
        (val) =>
          val !== null && val !== VALORES_NULOS.STRING_NULL && val !== "",
      )
      .join(" ");

    const cacheKey = generarClaveCache({ q: query, clienteId: cliente.id });
    const datosCache = cacheService.obtenerDeCache(cacheKey);

    if (datosCache) {
      logger.info({ reqId }, "Cache HIT.");

      if (datosCache.piezas && datosCache.piezas.length > 0) {
        datosCache.respuesta = mensajeParaUsuario;
      }
      datosCache.nuevoContexto = JSON.stringify(busquedaBD);
      return datosCache;
    }

    const respuestaAPI = await apiRepository.consultarAPI({ q: query }, reqId, cliente);
    let resultadoFinal;

    if (!respuestaAPI.piezas || respuestaAPI.piezas.length === 0) {
      const cocheDesc = [busquedaBD.marca, busquedaBD.modelo, busquedaBD.ano]
        .filter(Boolean)
        .join(" ");
      resultadoFinal = {
        respuesta: `He revisado el almacén buscando "${busquedaBD.articulo || "la pieza"}" para "${cocheDesc}". No tenemos stock disponible.\n\n¿Buscas alguna otra pieza?`,
        piezas: [],
        nuevoContexto: JSON.stringify(busquedaBD),
      };
    } else {
      resultadoFinal = {
        respuesta: mensajeParaUsuario,
        piezas: formatearParaReact(respuestaAPI.piezas.slice(0, 4)),
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
        nuevoContexto: contextoAnterior,
      };
    }
  }
};

module.exports = { seleccionRespuestaPremium };