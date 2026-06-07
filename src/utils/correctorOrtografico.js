const stringSimilarity = require("string-similarity");
const fs   = require("fs");
const path = require("path");
const { textNormalize } = require("./textNormalizer");
const logger = require("./logger");

// Sinónimos manuales aplicados antes de cualquier validación.
const SINONIMOS_HARDCODEADOS = {
  "parachoques": "paragolpes",
  "parachoque": "paragolpes",
  "parachoke": "paragolpes",
  "parachoqe": "paragolpes",
  "paraqoke": "paragolpes",
  "paragolpe": "paragolpes",
  "embraque": "embrague",
  "bonba": "bomba",
  // Cristales / lunas
  "ventanilla": "luna",
  "ventanillas": "lunas",
  "cristal": "luna",
  "cristales": "lunas",
  "vidrio": "luna",
  "vidrios": "lunas",
};

// Palabras vacías o conectores gramaticales que ignoramos silenciosamente
// para no generar errores falsos en la aduana al validar palabras sueltas.
const CONECTORES_IGNORADOS = new Set([
  "de", "del", "el", "la", "los", "las",
  "un", "una", "unos", "unas",
  "para", "con", "y", "o", "a", "al",
  "mi", "tu", "su", "me", "te", "se",
  "es", "son", "hay",
  "lo", "le", "les",
]);

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

const PALABRAS_MARCAS    = extraerPalabrasUnicas(FRASES_MARCAS);
const PALABRAS_ARTICULOS = extraerPalabrasUnicas(FRASES_ARTICULOS);

const obtenerUmbralDinamico = (texto) => {
  const longitud = texto.length;
  // Un error de una sola letra en una palabra de 6-9 caracteres da ~0.667 de similitud
  // (ej: "camvios"→"cambios", "volamte"→"volante"). Con 0.68 esos typos NO se corregían.
  // 0.64 acepta el typo de 1 letra y sigue rechazando palabras no relacionadas (máx ~0.61).
  if (longitud <= 5) return 0.78;
  if (longitud <= 9) return 0.64;
  return 0.60;
};

const obtenerMejorMatch = (palabra, listaPalabras) => {
  if (!palabra || !listaPalabras?.length) return { rating: 0, target: null };
  return stringSimilarity.findBestMatch(palabra, listaPalabras).bestMatch;
};

/**
 * Corrige y valida un campo (artículo o marca) PALABRA A PALABRA contra su PROPIO
 * diccionario, preservando el orden y TODAS las palabras del usuario.
 *
 * Filosofía (la IA ya ha separado los campos, así que aquí solo limpiamos):
 *  - Cada palabra se compara únicamente con su diccionario (un artículo no se valida
 *    contra marcas ni viceversa) -> evita la contaminación entre campos.
 *  - Las palabras reconocidas se corrigen (typos); las no reconocidas se CONSERVAN
 *    tal cual en su sitio -> nunca tiramos modificadores ("delantero", "izquierdo")
 *    ni partes de un concepto multi-palabra ("ESPEJO RETROVISOR IZQUIERDO").
 *  - Los conectores ("de", "del"...) se mantienen literales -> "PERSIANA ENROLLABLE
 *    ELECTRICA DE PUERTA" no pierde el "DE".
 *  - Se admiten conceptos multi-palabra (marcas como "land rover" / "alfa romeo").
 *
 * @param {string} valor - El valor crudo del campo extraído por la IA.
 * @param {string[]} palabrasDic - Vocabulario del campo (PALABRAS_ARTICULOS o PALABRAS_MARCAS).
 * @returns {{ texto: string, algunaReconocida: boolean }}
 *   `algunaReconocida` es false solo si NINGUNA palabra (ni unida) pertenece al
 *   diccionario, lo que indica que el campo es ininteligible y debe rechazarse.
 */
const corregirCampo = (valor, palabrasDic) => {
  const tokens = aplicarSinonimos(String(valor)).split(/\s+/).filter(Boolean);

  // Solo aceptamos unir dos tokens si el resultado es CASI exacto. Así "para"+"golpes"
  // → "paragolpes" (1.0) se une, pero "de"+"puerta" → "depuerta" (~0.83) NO se une y
  // el conector "de" se conserva (p.ej. "PERSIANA ENROLLABLE ELECTRICA DE PUERTA").
  const UMBRAL_UNION = 0.9;

  const salida = [];
  let algunaReconocida = false;

  for (let i = 0; i < tokens.length; i++) {
    const palabraNorm = textNormalize(tokens[i]);
    if (!palabraNorm) continue;

    // 1) Palabra partida (ej: "para" + "golpes" → "paragolpes"): solo si es casi exacta.
    if (i < tokens.length - 1) {
      const unido = palabraNorm + textNormalize(tokens[i + 1]);
      const matchUnido = obtenerMejorMatch(unido, palabrasDic);
      if (matchUnido.rating >= UMBRAL_UNION) {
        logger.info(`Aduana: Uniendo palabras partidas "${tokens[i]} ${tokens[i + 1]}" → "${matchUnido.target}"`);
        salida.push(matchUnido.target);
        algunaReconocida = true;
        i++; // consumimos la siguiente
        continue;
      }
    }

    // 2) Conectores gramaticales: se conservan literales y no se validan.
    if (CONECTORES_IGNORADOS.has(palabraNorm)) {
      salida.push(palabraNorm);
      continue;
    }

    // 3) Palabra reconocida: la corregimos al término oficial del diccionario.
    const umbral = obtenerUmbralDinamico(palabraNorm);
    const match = obtenerMejorMatch(palabraNorm, palabrasDic);
    if (match.rating >= umbral) {
      if (palabraNorm !== textNormalize(match.target)) {
        logger.info(`Aduana: Corregido "${tokens[i]}" → "${match.target}"`);
      }
      salida.push(match.target);
      algunaReconocida = true;
      continue;
    }

    // 4) No reconocida: la conservamos tal cual (no la tiramos).
    salida.push(palabraNorm);
  }

  return { texto: salida.join(" ").trim(), algunaReconocida };
};

const tieneValor = (v) =>
  v !== null && v !== undefined && String(v).trim() !== "" && String(v).toLowerCase() !== "null";

/**
 * Valida y corrige los campos de búsqueda (articulo, marca, modelo) preservando
 * conceptos multi-palabra. Cada campo se valida de forma AISLADA contra su propio
 * diccionario; el modelo se confía a la IA (códigos muy variables: "A3", "Serie 3",
 * "Range Rover") y no se valida contra una lista para no romperlo.
 */
const validarYCorregir = (ctx) => {
  const contextoNuevo = { ...ctx };
  const errores = [];

  // ARTÍCULO
  if (tieneValor(ctx.articulo)) {
    const { texto, algunaReconocida } = corregirCampo(ctx.articulo, PALABRAS_ARTICULOS);
    if (algunaReconocida) {
      contextoNuevo.articulo = texto;
    } else {
      contextoNuevo.articulo = null;
      errores.push({ campo: "articulo", original: ctx.articulo });
    }
  } else {
    contextoNuevo.articulo = null;
  }

  // MARCA
  if (tieneValor(ctx.marca)) {
    const { texto, algunaReconocida } = corregirCampo(ctx.marca, PALABRAS_MARCAS);
    if (algunaReconocida) {
      contextoNuevo.marca = texto;
    } else {
      contextoNuevo.marca = null;
      errores.push({ campo: "marca", original: ctx.marca });
    }
  } else {
    contextoNuevo.marca = null;
  }

  // MODELO: se confía en la extracción de la IA (no se valida contra lista).
  contextoNuevo.modelo = tieneValor(ctx.modelo) ? String(ctx.modelo).trim() : null;

  if (errores.length > 0) {
    const partesError = errores.map(({ campo, original }) => {
      const nombreHumano = campo === "articulo" ? "el artículo" : "la marca";
      return `"${original}" en ${nombreHumano}`;
    });

    const mensaje = partesError.length === 1
      ? `No he logrado entender ${partesError[0]}. ¿Podrías revisarlo o usar un sinónimo?`
      : `No he logrado entender ${partesError.join(" ni ")}. ¿Podrías revisarlo?`;

    return { error: true, mensaje, contextoCorregido: contextoNuevo };
  }

  return { error: false, contextoCorregido: contextoNuevo };
};

module.exports = { validarYCorregir };