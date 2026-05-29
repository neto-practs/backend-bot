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
  "parachoque": "paragolpes",
  "paraqoke": "paragolpes",
  "paragolpe": "paragolpes",
  "embraque": "embrague",
  "bonba": "bomba"
};

// Palabras vacías o conectores gramaticales que ignoramos silenciosamente
// para no generar errores falsos en la aduana al validar palabras sueltas.
const CONECTORES_IGNORADOS = new Set(["de", "del", "el", "la", "los", "las", "para", "con", "y", "o"]);

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
const FRASES_MODELOS   = cargarDiccionario("modelos.txt");

const PALABRAS_MARCAS    = extraerPalabrasUnicas(FRASES_MARCAS);
const PALABRAS_ARTICULOS = extraerPalabrasUnicas(FRASES_ARTICULOS);
const PALABRAS_MODELOS   = extraerPalabrasUnicas(FRASES_MODELOS);

/**
 * ÍNDICES INVERTIDOS: Mapean cada palabra individual a los índices de las frases 
 * completas de los diccionarios. Esto permite validar conceptos multi-palabra.
 */
const INDICE_ARTICULOS = {};
FRASES_ARTICULOS.forEach((frase, index) => {
  frase.split(/\s+/).forEach(palabra => {
    if (!INDICE_ARTICULOS[palabra]) INDICE_ARTICULOS[palabra] = new Set();
    INDICE_ARTICULOS[palabra].add(index);
  });
});

const INDICE_MARCAS = {};
FRASES_MARCAS.forEach((frase, index) => {
  frase.split(/\s+/).forEach(palabra => {
    if (!INDICE_MARCAS[palabra]) INDICE_MARCAS[palabra] = new Set();
    INDICE_MARCAS[palabra].add(index);
  });
});

const obtenerUmbralDinamico = (texto) => {
  const longitud = texto.length;
  if (longitud <= 5) return 0.80;
  if (longitud <= 9) return 0.68;
  return 0.62;
};

const obtenerMejorMatch = (palabra, listaPalabras) => {
  if (!palabra || !listaPalabras?.length) return { rating: 0, target: null };
  return stringSimilarity.findBestMatch(palabra, listaPalabras).bestMatch;
};

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
 * Determina si un grupo de palabras corregidas pertenecen a un mismo concepto (artículo o marca).
 * @param {string[]} palabras - Lista de palabras normalizadas y corregidas.
 * @param {Object} indice - El índice invertido a consultar (INDICE_ARTICULOS o INDICE_MARCAS).
 * @returns {boolean} True si todas las palabras aparecen en al menos una frase común del diccionario.
 */
const sonPalabrasCompatibles = (palabras, indice) => {
  if (palabras.length <= 1) return true;

  const setsDeIndices = palabras
    .map(p => indice[textNormalize(p)])
    .filter(Boolean);

  if (setsDeIndices.length < palabras.length) return false;

  const interseccion = setsDeIndices.reduce((acc, currentSet) => {
    return new Set([...acc].filter(idx => currentSet.has(idx)));
  });

  return interseccion.size > 0;
};

/**
 * Valida y corrige los campos de búsqueda (articulo, marca, modelo).
 * Utiliza lógica de intersección de conjuntos para permitir entidades multi-palabra.
 */
const validarYCorregir = (ctx) => {
  const contextoNuevo = { ...ctx };
  const originales = { articulo: ctx.articulo, marca: ctx.marca, modelo: ctx.modelo };
  const camposAValidar = ["articulo", "marca", "modelo"];
  
  const articulosTemp = [];
  const marcasTemp    = [];
  const modelosTemp   = [];
  const erroresFatales = [];

  for (const campo of camposAValidar) {
    const valor = ctx[campo];
    if (!valor || String(valor).trim() === "" || String(valor).toLowerCase() === "null") continue;

    const textoConSinonimos = aplicarSinonimos(String(valor));
    
    // Filtramos conectores gramaticales para que "caja de cambios" se analice como ["caja", "cambios"]
    const tokens = textoConSinonimos
      .split(/\s+/)
      .filter(Boolean)
      .filter(token => !CONECTORES_IGNORADOS.has(textNormalize(token)));
      
    const palabrasCorregidas = [];
    const tokensParaUnir = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const palabraNorm = textNormalize(token);
      if (!palabraNorm) continue;

      const umbral = obtenerUmbralDinamico(palabraNorm);
      let clasificacion = clasificarPalabra(palabraNorm, umbral);

      // Si no la reconoce, intentamos unirla con la siguiente palabra (ej: "oara" + "golpes")
      if (!clasificacion.reconocida && i < tokens.length - 1) {
        const siguienteToken = tokens[i + 1];
        const tokenUnido = palabraNorm + textNormalize(siguienteToken);
        const clasificacionUnida = clasificarPalabra(tokenUnido, obtenerUmbralDinamico(tokenUnido));
        
        if (clasificacionUnida.reconocida) {
          clasificacion = clasificacionUnida;
          logger.info(`Aduana: Uniendo palabras partidas "${token} ${siguienteToken}" → "${clasificacion.target}"`);
          i++; // Saltamos el siguiente token porque ya lo hemos unido
        }
      }

      if (!clasificacion.reconocida) {
        if (campo === "modelo") {
          modelosTemp.push(token);
        } else if (!erroresFatales.some(e => e.campoOriginal === campo)) {
          erroresFatales.push({ texto: token, campoOriginal: campo });
        }
        continue;
      }

      // Guardamos el match corregido en la lista temporal del campo
      if (clasificacion.tipo === "articulo") {
        if (campo === "articulo") palabrasCorregidas.push(clasificacion.target);
        else articulosTemp.push(clasificacion.target);
      } else if (clasificacion.tipo === "marca") {
        if (campo === "marca") palabrasCorregidas.push(clasificacion.target);
        else marcasTemp.push(clasificacion.target);
      } else {
        modelosTemp.push(token);
      }

      // Si era una palabra única y ha sido corregida (no unida)
      if (palabraNorm !== textNormalize(clasificacion.target) && clasificacion.tipo !== "modelo") {
        logger.info(`Aduana: Corregido "${token}" → "${clasificacion.target}" (${clasificacion.tipo})`);
      }
    }

    // Validación de compatibilidad al final del campo
    if (palabrasCorregidas.length > 0) {
      const indice = campo === "articulo" ? INDICE_ARTICULOS : (campo === "marca" ? INDICE_MARCAS : null);
      
      if (indice && sonPalabrasCompatibles(palabrasCorregidas, indice)) {
        const conceptoUnico = palabrasCorregidas.join(" ");
        if (campo === "articulo") articulosTemp.push(conceptoUnico);
        else marcasTemp.push(conceptoUnico);
      } else {
        // FALLBACK: Si las palabras no forman una frase exacta, buscamos el mejor matching global
        const listaFrases = campo === "articulo" ? FRASES_ARTICULOS : (campo === "marca" ? FRASES_MARCAS : []);
        const textoLimpio = palabrasCorregidas.join(" "); // ej: "espejo retrovisor izquierdo"
        
        if (listaFrases.length > 0) {
          const mejorMatchGlobal = obtenerMejorMatch(textoLimpio, listaFrases);
          
          if (mejorMatchGlobal && mejorMatchGlobal.rating > 0.65) {
            logger.info(`Aduana: Fallback global para "${textoLimpio}" → "${mejorMatchGlobal.target}" (${campo})`);
            if (campo === "articulo") articulosTemp.push(mejorMatchGlobal.target);
            else marcasTemp.push(mejorMatchGlobal.target);
          } else {
            // Si el matching global es pobre, guardamos separadas (probablemente lanzará error de múltiples)
            if (campo === "articulo") articulosTemp.push(...palabrasCorregidas);
            else if (campo === "marca") marcasTemp.push(...palabrasCorregidas);
          }
        } else {
          if (campo === "articulo") articulosTemp.push(...palabrasCorregidas);
          else if (campo === "marca") marcasTemp.push(...palabrasCorregidas);
        }
      }
    }
  }

  // Limpieza y reconstrucción (tomamos el primer concepto de cada campo)
  contextoNuevo.articulo = articulosTemp.length > 0 ? [...new Set(articulosTemp)][0] : null;
  contextoNuevo.modelo   = [...new Set(modelosTemp)].join(" ").trim() || null;
  
  const marcasUnicas = [...new Set(marcasTemp)];
  contextoNuevo.marca = marcasUnicas.length > 0 ? marcasUnicas[0] : null;

  if (erroresFatales.length > 0) {
    // Agrupamos errores por campo para mostrar el valor original completo
    const camposConError = [...new Set(erroresFatales.map(e => e.campoOriginal))];

    const partesError = camposConError.map(campo => {
      const nombreHumano = campo === "articulo" ? "el artículo" : "la marca";
      const valorOriginal = originales[campo];
      return `"${valorOriginal}" en ${nombreHumano}`;
    });

    const mensaje = partesError.length === 1 
      ? `No he logrado entender ${partesError[0]}. ¿Podrías revisarlo o usar un sinónimo?`
      : `No he logrado entender ${partesError.join(" ni ")}. ¿Podrías revisarlo?`;

    return { error: true, mensaje, contextoCorregido: contextoNuevo };
  }

  // Bloqueo por Múltiples Marcas (solo si son conceptos diferentes)
  if (marcasTemp.length > 1) {
    const unicasReal = [...new Set(marcasTemp)];
    if (unicasReal.length > 1) {
      return {
        error: true,
        mensaje: `Parece que has mencionado varias marcas (${unicasReal.join(", ")}). Por favor, dime solo una.`,
        contextoCorregido: contextoNuevo,
      };
    }
  }

  // Bloqueo por Múltiples Artículos
  if (articulosTemp.length > 1) {
    const unicosReal = [...new Set(articulosTemp)];
    if (unicosReal.length > 1) {
      return {
        error: true,
        mensaje: `Parece que buscas varios artículos a la vez (${unicosReal.join(", ")}). Por favor, dime solo uno específico.`,
        contextoCorregido: contextoNuevo,
      };
    }
  }

  return { error: false, contextoCorregido: contextoNuevo };
};

module.exports = { validarYCorregir };