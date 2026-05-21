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
const { validarYCorregir } = require("../utils/correctorOrtografico");

const RUNPOD_IA_URL = process.env.RUNPOD_IA_URL;
const RUNPOD_IA_TOKEN = process.env.RUNPOD_IA_TOKEN;
const RUNPOD_IA_MODEL = process.env.RUNPOD_IA_MODEL;
const AI_TEMPERATURE = parseFloat(process.env.RUNPOD_AI_TEMPERATURE) || 0.0;
const AI_MAX_TOKENS = parseInt(process.env.RUNPOD_IA_MAX_TOKENS) || 400;

// Esquema simplificado para extracción pura
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

      // Si la IA ha extraído algún campo de búsqueda, forzamos el modo búsqueda
      const tieneAlgunDato = intentExtraido.articulo || intentExtraido.marca || intentExtraido.modelo || intentExtraido.ano || intentExtraido.version || intentExtraido.referencia;
      if (tieneAlgunDato) {
        intentExtraido.es_busqueda = true;
      }

      // PASO 1: Validar, corregir y recolocar el intento NUEVO (Antes de fusionar)
      let intentLimpio = intentExtraido;
      
      // Si la IA ha detectado que es una búsqueda o ha extraído algún dato, pasamos la Aduana
      if (intentExtraido.es_busqueda || intentExtraido.articulo || intentExtraido.marca || intentExtraido.modelo) {
        // Le pasamos intentExtraido (solo lo nuevo), NO la memoria mezclada
        const resultadoFiltro = validarYCorregir(intentExtraido);
        
        // Si hay una palabra inventada o falta grave, bloqueamos en seco
        if (resultadoFiltro.error) {
           return {
             respuesta: resultadoFiltro.mensaje,
             piezas: [],
             //Devolvemos la memoria vieja intacta para que no se corrompa
             nuevoContexto: typeof contextoAnterior === "string" ? contextoAnterior : JSON.stringify(contextoAnterior || {})
           };
        }
        // Guardamos el intento ya limpio, con ortografía perfecta y marcas recolocadas
        intentLimpio = resultadoFiltro.contextoCorregido;
      }

      // PASO 2: fusionamos el contexto LIMPIO con el historial
      
      const { contexto, realizarBusqueda } = fusionarContexto(
        contextoAnterior,
        intentLimpio
      );

      // PASO 3: Decidir modo búsqueda y actualizar la base de datos de memoria
      const tieneDatosEnMemoria = !!(contexto.articulo || contexto.marca || contexto.modelo || contexto.referencia);
      const esModoBusqueda = (intentExtraido.es_busqueda || tieneDatosEnMemoria) && realizarBusqueda;

      busquedaBD = contexto;
      quiereBuscar = esModoBusqueda && realizarBusqueda;

      if (!esModoBusqueda) {
        // Modo conversación: Solo si no hay una búsqueda activa ni datos en memoria
        const posiblesRespuestasCharla = [
          intentExtraido.respuesta_usuario || "¿En qué te puedo ayudar hoy?",
          "Dime, ¿qué necesitas para tu coche?",
          "¡Hola! Cuéntame, ¿qué pieza estás buscando?",
          "Estoy aquí para ayudarte, ¿buscamos alguna pieza?"
        ];
        mensajeParaUsuario = getRandom(posiblesRespuestasCharla);
        logger.info({ reqId }, "Modo Conversación. Habla la IA.");
      } else {
        // Modo búsqueda: El dialogHelper toma el control de las preguntas basadas en la memoria (busquedaBD)
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

    // Retorno temprano si no se cumplen los requisitos para consultar BBDD
    if (!quiereBuscar) {
      return {
        respuesta: mensajeParaUsuario,
        piezas: [],
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
      return datosCache;
    }

    const respuestaAPI = await apiRepository.consultarAPI({ q: query }, reqId, cliente);
    let resultadoFinal;

    if (!respuestaAPI.piezas || respuestaAPI.piezas.length === 0) {
      const cocheDesc = [busquedaBD.marca, busquedaBD.modelo, busquedaBD.ano].filter(Boolean).join(" ");
      resultadoFinal = {
        respuesta: `He revisado el almacén buscando "${busquedaBD.articulo || "tu pieza"}" para "${cocheDesc || "el vehiculo deseado"}". Pero actualmente no tenemos stock disponible.\n\n¿Buscas alguna otra pieza?`,
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