const { DICCIONARIO_MARCAS } = require("../data/diccionarioMarcas");
const { DICCIONARIO_MODELOS } = require("../data/diccionarioModelos");
const { DICCIONARIO_ARTICULOS } = require("../data/diccionarioArticulos");
const { DICCIONARIO_FAMILIAS } = require("../data/diccionarioFamilias");
const { DICCIONARIO_VERSIONES } = require("../data/diccionarioVersiones");
const { textNormalize } = require("./textNormalizer");
const stringSimilarity = require("string-similarity");

const diccionarioMarcas = Object.values(DICCIONARIO_MARCAS).flat().map(textNormalize);
const diccionarioModelos = Object.values(DICCIONARIO_MODELOS).flat().map(textNormalize);
const diccionarioVersiones = DICCIONARIO_VERSIONES.map(textNormalize);

const palabrasIgnorar = [
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "con",
  "desde", "para", "por", "y", "en", "mi", "tu", "su", "quiero", "necesito",
  "busco", "tengo", "hola", "buenas", "dias", "tardes", "es", "hay", "teneis",
  "tienen", "pieza", "piezas", "recambio", "recambios", "repuesto", "repuestos",
  "coche", "coches", "vehiculo", "vehiculos", "auto", "autos", "furgoneta", "moto",
  "marca", "marcas", "modelo", "modelos", "año", "ano", "años", "anos", "ahora", "me", "he", "equivocado",
  "perdon", "lo", "siento"
];

const siglasMotor = [
  "d", "i", "s", "t", "e", "c", "tdi", "jtd", "hdi", "dci", "cdti", "crdi", "cdi", "td", "sdi", "tid", "vcdi", "jtdm", "ddis",
  "tsi", "tfsi", "fsi", "gdi", "vti", "vtec", "jts", "awd", "fwd", "rwd", "4wd", "4x4", "4x2", "xdrive", "sdrive", "4matic", "4motion", "all4",
  "gl", "gls", "glx", "lx", "sx", "ex", "gx", "vx", "vxl", "amg", "gti", "gtd", "st", "rs", "vts", "vtr", "rt", "rn"
];    

// Función que saca palabras sueltas de cualquier diccionario
const extraerPalabras = (diccionario) => {
  const data = Array.isArray(diccionario) ? diccionario : Object.values(diccionario).flat();
  const todasPalabras = data
    .map(textNormalize)
    .join(" ")
    .split(" ");
  return [...new Set(todasPalabras)];
};

// Preparamos los arrays de palabras sueltas
const arrayMarcas = extraerPalabras(DICCIONARIO_MARCAS);
const arrayModelos = extraerPalabras(DICCIONARIO_MODELOS);
const arrayArticulos = extraerPalabras(DICCIONARIO_ARTICULOS);
const arrayFamilias = extraerPalabras(DICCIONARIO_FAMILIAS);
const arrayVersiones = extraerPalabras(DICCIONARIO_VERSIONES);

const construirQuery = (textoUsuario) => {
  const textoLimpio = textNormalize(textoUsuario);
  const palabras = textoLimpio.split(" ");

  let desglose = {
    familias: [], marcas: [], articulo: [], modelos: [], referencias: [], versiones: [],
  };

  for (let palabra of palabras) {
    // Escudo anti-basura
    if (palabrasIgnorar.includes(palabra)) continue;

    // Buscamos las referencias
    const esReferenciaVisual = 
      palabra.length >= 4 &&
      palabra.length <= 20 &&
      /\d/.test(palabra) &&
      /^[a-zA-Z0-9]+$/.test(palabra) &&
      !arrayModelos.includes(palabra);

    if (esReferenciaVisual) {
      desglose.referencias.push(palabra);
      continue;
    }
    
    // VERSIONES TÉCNICAS Y SIGLAS (Prioridad ABSOLUTA para evitar conflictos con letras sueltas)
    const esCilindrada = /^\d\.\d[a-z]*$/i.test(palabra);
    const esValvulas = /^\d{1,2}v$/i.test(palabra);
    
    if (esCilindrada || esValvulas || siglasMotor.includes(palabra)) {
      desglose.versiones.push(palabra);
      continue;
    }

    // DICCIONARIOS EXACTOS (Las piezas y coches van antes para que nada se los robe)
    if (arrayArticulos.includes(palabra)) { desglose.articulo.push(palabra); continue; }
    if (arrayFamilias.includes(palabra)) { desglose.familias.push(palabra); continue; }
    if (arrayMarcas.includes(palabra)) { desglose.marcas.push(palabra); continue; }
    if (arrayModelos.includes(palabra)) { desglose.modelos.push(palabra); continue; }

    // RESTO DE VERSIONES DEL EXCEL (Recoge lo que sobró y no era ni coche ni pieza, ej: "distinctive")
    if (arrayVersiones.includes(palabra)) { desglose.versiones.push(palabra); continue; }

    //  ¿Está CONTENIDA en alguna frase? (Para palabras de más de 3 letras)
    if (palabra.length > 3) {
      const regex = new RegExp(`\\b${palabra}\\b`, "i");

      if (diccionarioMarcas.some(t => regex.test(t))) { desglose.marcas.push(palabra); continue; }
      if (diccionarioModelos.some(t => regex.test(t))) { desglose.modelos.push(palabra); continue; }
      if (diccionarioVersiones.some(t => regex.test(t))) { desglose.versiones.push(palabra); continue; }
    }

    // Si no hay suerte, probamos similitud (Levenshtein) para corregir errores ortográficos
    const matchArticulo = stringSimilarity.findBestMatch(palabra, arrayArticulos).bestMatch;
    const matchFamilia = stringSimilarity.findBestMatch(palabra, arrayFamilias).bestMatch;

    if (matchArticulo.rating >= 0.80 && matchArticulo.rating >= matchFamilia.rating) {
      desglose.articulo.push(matchArticulo.target);
    } else if (matchFamilia.rating >= 0.80) {
      desglose.familias.push(matchFamilia.target);
    }
  }

  // Limpieza de modelos cortos
  let contadorCortas = 0;
  desglose.modelos = desglose.modelos.filter((m) => {
    if (m.length >= 3) return true;
    if (contadorCortas < 2) { contadorCortas++; return true; }
    return false; 
  });

  // Montamos la frase final para el desguace
  const queryFinal = [
    ...desglose.articulo,
    ...desglose.marcas,
    ...desglose.familias,
    ...desglose.modelos,
    ...desglose.referencias,
    ...desglose.versiones,
  ].filter(Boolean).join(" ").trim();

  return { queryFinal, desglose };
};

module.exports = { construirQuery };