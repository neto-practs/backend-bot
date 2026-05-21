const stringSimilarity = require("string-similarity");
const fs = require("fs");
const path = require("path");
const { textNormalize } = require("./textNormalizer");
const logger = require("./logger");

// Diccionario manual de sinónimos directos (se aplica antes de corregir)
const SINONIMOS_HARDCODEADOS = {
  "parachoques": "paragolpes"
};

// Función para reemplazar sinónimos en un texto
const aplicarSinonimos = (textoOriginal) => {
  if (!textoOriginal) return textoOriginal;
  let textoModificado = textoOriginal;
  for (const [sinonimo, oficial] of Object.entries(SINONIMOS_HARDCODEADOS)) {
    const regex = new RegExp(`\\b${sinonimo}\\b`, "gi");
    textoModificado = textoModificado.replace(regex, oficial);
  }
  return textoModificado;
};

// Función para extraer palabras únicas de un array de frases
const extraerPalabrasUnicas = (frases) => {
  const todas = frases.join(" ").split(" ");
  return [...new Set(todas)].filter(p => p.length > 0);
};

// Carga e indexa los diccionarios
const cargarDiccionario = (nombreArchivo) => {
  try {
    const ruta = path.join(__dirname, "..", "data", nombreArchivo);
    if (!fs.existsSync(ruta)) {
      logger.warn(`Diccionario no encontrado: ${nombreArchivo}`);
      return [];
    }
    const contenido = fs.readFileSync(ruta, "utf-8");
    return contenido
      .split(/\r?\n/)
      .map((linea) => textNormalize(linea))
      .filter((linea) => linea.length > 0);
  } catch (error) {
    logger.error(`Error al cargar el diccionario ${nombreArchivo}: ${error.message}`);
    return [];
  }
};

// Diccionarios de frases (originales)
const FRASES_MARCAS = cargarDiccionario("marcas.txt");
const FRASES_ARTICULOS = cargarDiccionario("articulos.txt");
const FRASES_MODELOS = cargarDiccionario("modelos.txt");

// Diccionarios de palabras sueltas (para matching individual)
const PALABRAS_MARCAS = extraerPalabrasUnicas(FRASES_MARCAS);
const PALABRAS_ARTICULOS = extraerPalabrasUnicas(FRASES_ARTICULOS);
const PALABRAS_MODELOS = extraerPalabrasUnicas(FRASES_MODELOS);

/**
 * Calcula un umbral dinámico según la longitud de la palabra.
 */
const obtenerUmbralDinamico = (texto) => {
  const longitud = texto.length;
  if (longitud <= 5) return 0.80;
  if (longitud <= 9) return 0.68;
  return 0.62; 
};

/**
 * Busca el mejor match en un diccionario de palabras.
 */
const obtenerMejorMatch = (word, listaPalabras) => {
  if (!word || !listaPalabras || listaPalabras.length === 0) {
    return { rating: 0, target: null };
  }
  const matches = stringSimilarity.findBestMatch(word, listaPalabras);
  return matches.bestMatch;
};

/**
 * Valida y corrige los campos de búsqueda (articulo, marca, modelo).
 */
const validarYCorregir = (ctx) => {
  let contextoNuevo = { ...ctx };
  
  // Guardamos los originales *exactos* que introdujo el usuario/IA
  const originales = {
    articulo: ctx.articulo,
    marca: ctx.marca,
    modelo: ctx.modelo
  };

  const camposAValidar = ['articulo', 'marca', 'modelo'];
  let todasLasPalabras = [];

  // Mapeamos las palabras aplicando sinónimos primero
  camposAValidar.forEach(campo => {
    if (ctx[campo] && String(ctx[campo]).trim() !== "" && String(ctx[campo]).toLowerCase() !== "null") {
      const textoConSinonimos = aplicarSinonimos(String(ctx[campo]));
      const palabras = textoConSinonimos.split(/\s+/);
      palabras.forEach(p => {
        todasLasPalabras.push({ texto: p, campoOriginal: campo });
      });
    }
  });

  if (todasLasPalabras.length === 0) return { error: false, contextoCorregido: contextoNuevo };

  // Limpiamos los campos para la nueva distribución
  contextoNuevo.articulo = null;
  contextoNuevo.marca = null;
  contextoNuevo.modelo = null;

  let articulosTemp = [];
  let marcasTemp = [];
  let modelosTemp = [];
  let erroresEncontrados = [];

  for (const item of todasLasPalabras) {
    const palabraOriginal = item.texto;
    const palabraNorm = textNormalize(palabraOriginal);
    if (!palabraNorm) continue;

    const umbral = obtenerUmbralDinamico(palabraNorm);

    const matchArt = obtenerMejorMatch(palabraNorm, PALABRAS_ARTICULOS);
    const matchMar = obtenerMejorMatch(palabraNorm, PALABRAS_MARCAS);
    const matchMod = obtenerMejorMatch(palabraNorm, PALABRAS_MODELOS);

    const candidatos = [
      { tipo: 'articulo', match: matchArt },
      { tipo: 'marca', match: matchMar },
      { tipo: 'modelo', match: matchMod }
    ];

    candidatos.sort((a, b) => b.match.rating - a.match.rating);
    const ganador = candidatos[0];

    // LÓGICA DE DECISIÓN
    if (ganador.match.rating >= umbral) {
      if (ganador.tipo === 'articulo') articulosTemp.push(ganador.match.target);
      else if (ganador.tipo === 'marca') marcasTemp.push(ganador.match.target);
      else modelosTemp.push(palabraOriginal); 

      if (palabraNorm !== textNormalize(ganador.match.target) && ganador.tipo !== 'modelo') {
        logger.info(`Aduana: Corregido leve "${palabraOriginal}" a "${ganador.match.target}" (${ganador.tipo})`);
      }
    } else {
      // ERROR: No entiendo esta palabra. La guardamos para notificar al final.
      erroresEncontrados.push(item);
      logger.warn(`Aduana: Palabra no reconocida "${palabraOriginal}" del campo ${item.campoOriginal}`);
    }
  }

  // Reconstruimos los strings finales
  contextoNuevo.articulo = [...new Set(articulosTemp)].join(" ").trim() || null;
  // Guardamos las marcas únicas en un array temporal para contarlas
  const marcasUnicasDetectadas = [...new Set(marcasTemp)];
  contextoNuevo.marca = marcasUnicasDetectadas.join(" ").trim() || null;
  contextoNuevo.modelo = [...new Set(modelosTemp)].join(" ").trim() || null;

  // Errores ortográficos o palabras inventadas
  if (erroresEncontrados.length > 0) {
    const primerError = erroresEncontrados[0];
    // Excepción de Inmunidad para Modelos (Solución al Error 2 Crítico)
    if (primerError.campoOriginal === 'modelo') {
       contextoNuevo.modelo = originales.modelo; // Si falla en modelo, lo dejamos pasar crudo
    } else {
      const valorAVisualizar = originales[primerError.campoOriginal] || primerError.texto;
      const nombreCampoHumanizado = primerError.campoOriginal === 'articulo' ? 'el artículo' : 'la marca';

      return {
        error: true,
        mensaje: `No he logrado entender ${nombreCampoHumanizado}: "${valorAVisualizar}". ¿Podrías reescribirlo para que pueda ayudarte mejor?`,
        contextoCorregido: contextoNuevo
      };
    }
  }

  // 2º Filtro : Bloqueo de marcas múltiples
  // Si la Aduana ha detectado más de 1 marca válida distinta (Ej. Audi y Volkswagen)
  if (marcasUnicasDetectadas.length > 1) {
     logger.warn(`Aduana: Bloqueo por múltiples marcas detectadas: ${contextoNuevo.marca}`);
     return {
       error: true,
       mensaje: `Parece que has mencionado varias marcas a la vez (${marcasUnicasDetectadas.join(", ")}). Por favor, dime solo la marca exacta del vehículo para la que necesitas la pieza.`,
       contextoCorregido: contextoNuevo // Devolvemos el contexto para no perder la pieza que haya pedido
     };
  }

  return { error: false, contextoCorregido: contextoNuevo };
};

module.exports = { validarYCorregir };
