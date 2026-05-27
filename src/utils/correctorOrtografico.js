const stringSimilarity = require("string-similarity");
const fs   = require("fs");
const path = require("path");
const { textNormalize } = require("./textNormalizer");
const logger = require("./logger");

// Sinónimos manuales aplicados antes de cualquier validación.
const SINONIMOS_HARDCODEADOS = {
  "parachoques": "paragolpes",
};

const aplicarSinonimos = (textoOriginal) => {
  if (!textoOriginal) return textoOriginal;
  let resultado = textoOriginal;
  for (const [sinonimo, oficial] of Object.entries(SINONIMOS_HARDCODEADOS)) {
    const regex = new RegExp(`\\b${sinonimo}\\b`, "gi");
    resultado = resultado.replace(regex, oficial);
  }
  return resultado;
};

const extraerPalabrasUnicas = (frases) => {
  const todas = frases.join(" ").split(" ");
  return [...new Set(todas)].filter(token => token.length > 0);
};

/**
 * Carga un diccionario de texto plano desde la carpeta /data y lo normaliza.
 * Devuelve [] si el archivo no existe, para no romper el arranque del servidor.
 */
const cargarDiccionario = (nombreArchivo) => {
  try {
    const ruta = path.join(__dirname, "..", "data", nombreArchivo);
    if (!fs.existsSync(ruta)) {
      logger.warn(`Diccionario no encontrado: ${nombreArchivo}`);
      return [];
    }
    return fs.readFileSync(ruta, "utf-8")
      .split(/\r?\n/)
      .map(linea => textNormalize(linea))
      .filter(linea => linea.length > 0);
  } catch (error) {
    logger.error(`Error al cargar el diccionario ${nombreArchivo}: ${error.message}`);
    return [];
  }
};

const FRASES_MARCAS    = cargarDiccionario("marcas.txt");
const FRASES_ARTICULOS = cargarDiccionario("articulos.txt");
const FRASES_MODELOS   = cargarDiccionario("modelos.txt");

const PALABRAS_MARCAS    = extraerPalabrasUnicas(FRASES_MARCAS);
const PALABRAS_ARTICULOS = extraerPalabrasUnicas(FRASES_ARTICULOS);
const PALABRAS_MODELOS   = extraerPalabrasUnicas(FRASES_MODELOS);

/**
 * Devuelve un umbral de similitud ajustado a la longitud de la palabra.
 * Palabras cortas requieren un match casi exacto para evitar falsos positivos.
 */
const obtenerUmbralDinamico = (texto) => {
  const longitud = texto.length;
  if (longitud <= 5) return 0.80;
  if (longitud <= 9) return 0.68;
  return 0.62;
};

/**
 * Busca el candidato más parecido en un diccionario de palabras.
 */
const obtenerMejorMatch = (palabra, listaPalabras) => {
  if (!palabra || !listaPalabras?.length) return { rating: 0, target: null };
  return stringSimilarity.findBestMatch(palabra, listaPalabras).bestMatch;
};

/**
 * Compara una palabra normalizada contra los tres diccionarios y devuelve
 * el tipo ganador (articulo, marca o modelo) si supera el umbral de similitud.
 * @param {string} palabraNorm - Palabra ya normalizada
 * @param {number} umbral - Umbral mínimo de similitud para aceptar el match
 * @returns {{ reconocida: boolean, tipo?: string, target?: string }}
 */
const clasificarPalabra = (palabraNorm, umbral) => {
  const candidatos = [
    { tipo: "articulo", match: obtenerMejorMatch(palabraNorm, PALABRAS_ARTICULOS) },
    { tipo: "marca",    match: obtenerMejorMatch(palabraNorm, PALABRAS_MARCAS)    },
    { tipo: "modelo",   match: obtenerMejorMatch(palabraNorm, PALABRAS_MODELOS)   },
  ].sort((a, b) => b.match.rating - a.match.rating);

  const ganador = candidatos[0];
  if (ganador.match.rating >= umbral) {
    return { reconocida: true, tipo: ganador.tipo, target: ganador.match.target };
  }
  return { reconocida: false };
};

/**
 * Valida y corrige los campos de búsqueda extraídos por la IA (articulo, marca, modelo).
 * Aplica sinónimos, fuzzy matching y detecta palabras inventadas o marcas múltiples.
 * @param {Object} ctx - Contexto extraído por la IA
 * @returns {{ error: boolean, mensaje?: string, contextoCorregido: Object }}
 */
const validarYCorregir = (ctx) => {
  let contextoNuevo = { ...ctx };

  // Guardamos los valores originales para usarlos en los mensajes de error al usuario.
  const originales = {
    articulo: ctx.articulo,
    marca:    ctx.marca,
    modelo:   ctx.modelo,
  };

  const camposAValidar = ["articulo", "marca", "modelo"];
  const todasLasPalabras = [];

  for (const campo of camposAValidar) {
    const valor = ctx[campo];
    if (!valor || String(valor).trim() === "" || String(valor).toLowerCase() === "null") continue;

    const textoConSinonimos = aplicarSinonimos(String(valor));
    for (const token of textoConSinonimos.split(/\s+/)) {
      todasLasPalabras.push({ texto: token, campoOriginal: campo });
    }
  }

  if (todasLasPalabras.length === 0) return { error: false, contextoCorregido: contextoNuevo };

  contextoNuevo.articulo = null;
  contextoNuevo.marca    = null;
  contextoNuevo.modelo   = null;

  const articulosTemp    = [];
  const marcasTemp       = [];
  const modelosTemp      = [];
  const erroresEncontrados = [];

  for (const { texto: palabraOriginal, campoOriginal } of todasLasPalabras) {
    const palabraNorm = textNormalize(palabraOriginal);
    if (!palabraNorm) continue;

    const umbral       = obtenerUmbralDinamico(palabraNorm);
    const clasificacion = clasificarPalabra(palabraNorm, umbral);

    if (!clasificacion.reconocida) {
      erroresEncontrados.push({ texto: palabraOriginal, campoOriginal });
      logger.warn(`Aduana: Palabra no reconocida "${palabraOriginal}" del campo ${campoOriginal}`);
      continue;
    }

    if (clasificacion.tipo === "articulo")     articulosTemp.push(clasificacion.target);
    else if (clasificacion.tipo === "marca")   marcasTemp.push(clasificacion.target);
    else                                        modelosTemp.push(palabraOriginal); // Modelos: valor original crudo (ver excepción abajo)

    if (palabraNorm !== textNormalize(clasificacion.target) && clasificacion.tipo !== "modelo") {
      logger.info(`Aduana: Corregido "${palabraOriginal}" → "${clasificacion.target}" (${clasificacion.tipo})`);
    }
  }

  contextoNuevo.articulo = [...new Set(articulosTemp)].join(" ").trim() || null;
  contextoNuevo.modelo   = [...new Set(modelosTemp)].join(" ").trim() || null;

  const marcasUnicas     = [...new Set(marcasTemp)];
  contextoNuevo.marca    = marcasUnicas.join(" ").trim() || null;

  if (erroresEncontrados.length > 0) {
    const primerError = erroresEncontrados[0];

    // Excepción de inmunidad para modelos: los modelos no siempre están en el diccionario
    // (ej: "3008", "Q5 Sportback") y bloquearlos provocaría falsos negativos graves.
    // Si falla en modelo, lo dejamos pasar con su valor original.
    if (primerError.campoOriginal === "modelo") {
      contextoNuevo.modelo = originales.modelo;
    } else {
      const valorMostrado   = originales[primerError.campoOriginal] || primerError.texto;
      const nombreHumanizado = primerError.campoOriginal === "articulo" ? "el artículo" : "la marca";
      return {
        error: true,
        mensaje: `No he logrado entender ${nombreHumanizado}: "${valorMostrado}". ¿Podrías reescribirlo para que pueda ayudarte mejor?`,
        contextoCorregido: contextoNuevo,
      };
    }
  }

  // Bloqueo de marcas múltiples: si el usuario dice "Audi y BMW", no podemos buscar
  // en dos marcas a la vez — la API solo acepta una marca por consulta.
  if (marcasUnicas.length > 1) {
    logger.warn(`Aduana: Bloqueo por múltiples marcas: ${contextoNuevo.marca}`);
    return {
      error: true,
      mensaje: `Parece que has mencionado varias marcas a la vez (${marcasUnicas.join(", ")}). Por favor, dime solo la marca exacta del vehículo para la que necesitas la pieza.`,
      contextoCorregido: contextoNuevo,
    };
  }

  return { error: false, contextoCorregido: contextoNuevo };
};

module.exports = { validarYCorregir };
