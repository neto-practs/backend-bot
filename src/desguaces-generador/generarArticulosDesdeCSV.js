/**
 * GENERADOR DE ARTÍCULOS Y FAMILIAS DESDE CSV
 * ---------------------------------------------------------------------------
 * Lee el catálogo de la web (familia_codigo,familia_nombre,articulo_codigo,articulo_nombre)
 * y FUSIONA con los diccionarios actuales, preservando los sinónimos hechos a mano.
 *
 * Genera / actualiza:
 *   1. src/data/diccionarioArticulos.js  (fusión: sinónimos existentes + artículos nuevos)
 *   2. src/data/diccionarioFamilias.js   (fusión: sinónimos existentes + familias nuevas)
 *   3. src/data/articulos.txt            (lista plana, alineada con el diccionario)
 *   4. src/data/familias.txt             (lista plana, alineada con el diccionario)
 *
 * Uso:
 *   node src/desguaces-generador/generarArticulosDesdeCSV.js "C:\\ruta\\al\\articulos.csv"
 * Si no se pasa ruta, usa la de Descargas por defecto.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const RUTA_CSV =
  process.argv[2] ||
  path.join(os.homedir(), "Downloads", "articulos_catalogo_conmuta.csv");

const DIR_DATA = path.join(__dirname, "..", "data");

// --- Helpers ----------------------------------------------------------------

const limpiar = (v) =>
  String(v ?? "")
    .replace(/^﻿/, "")
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Clave de comparación: mayúsculas, sin acentos, sin barras ni signos,
 * espacios colapsados. Así "CENTRALITA START / STOP" y "CENTRALITA START STOP"
 * se consideran el MISMO artículo y no se duplica perdiendo sinónimos.
 */
const claveNormalizada = (v) =>
  limpiar(v)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

const cargarDiccionarioExistente = (archivo, exportName) => {
  try {
    const mod = require(path.join(DIR_DATA, archivo));
    return mod[exportName] || {};
  } catch (_) {
    return {};
  }
};

/** Serializa un diccionario { CLAVE: [sinonimos] } a contenido .js legible. */
const serializarDiccionario = (dic, varName, comentario) => {
  const claves = Object.keys(dic).sort();
  const ordenado = {};
  claves.forEach((k) => (ordenado[k] = dic[k]));
  return (
    `// Archivo generado automáticamente desde el CSV - No editar a mano\n` +
    `// ${comentario}\n` +
    `const ${varName} = ${JSON.stringify(ordenado, null, 2)};\n\n` +
    `module.exports = { ${varName} };\n`
  );
};

/** Escribe una lista plana .txt con cabecera, formato "NOMBRE," por línea. */
const escribirTxt = (archivo, cabecera, claves) => {
  const lineas = [`-- ${cabecera} --`, ""].concat(
    [...claves].sort().map((c) => `${c},`)
  );
  fs.writeFileSync(path.join(DIR_DATA, archivo), lineas.join("\n") + "\n");
};

// --- Proceso ----------------------------------------------------------------

function generar() {
  if (!fs.existsSync(RUTA_CSV)) {
    console.error(`❌ No se encuentra el CSV en: ${RUTA_CSV}`);
    process.exit(1);
  }

  console.log(`📖 Leyendo: ${RUTA_CSV}`);
  const lineas = fs.readFileSync(RUTA_CSV, "utf8").split(/\r?\n/);

  // Saltamos la cabecera (primera línea)
  const articulosCSV = new Set();
  const familiasCSV = new Set();

  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i];
    if (!linea || !linea.trim()) continue;
    const campos = linea.split(",");
    const familia = limpiar(campos[1]).toUpperCase();
    const articulo = limpiar(campos[3]).toUpperCase();

    if (familia && familia !== "NULL") familiasCSV.add(familia);
    if (articulo && articulo !== "NULL" && articulo !== "NO IDENTIFICADO") {
      articulosCSV.add(articulo);
    }
  }

  // Cargamos los diccionarios actuales (con sus sinónimos curados)
  const dicArticulos = cargarDiccionarioExistente("diccionarioArticulos.js", "DICCIONARIO_ARTICULOS");
  const dicFamilias = cargarDiccionarioExistente("diccionarioFamilias.js", "DICCIONARIO_FAMILIAS");

  // Índices por CLAVE NORMALIZADA → clave real existente, para detectar el mismo
  // concepto aunque cambie "/", acentos o espacios.
  const indiceArticulos = {};
  for (const k of Object.keys(dicArticulos)) indiceArticulos[claveNormalizada(k)] = k;
  const indiceFamilias = {};
  for (const k of Object.keys(dicFamilias)) indiceFamilias[claveNormalizada(k)] = k;

  // --- FUSIÓN de artículos ---
  const nuevosArticulos = [];
  for (const art of articulosCSV) {
    const norm = claveNormalizada(art);
    const existente = indiceArticulos[norm];
    if (existente) {
      // Mismo concepto ya en el diccionario: añadimos la grafía exacta de la web como sinónimo
      const sinonimo = art.toLowerCase();
      if (!dicArticulos[existente].includes(sinonimo)) dicArticulos[existente].push(sinonimo);
    } else {
      dicArticulos[art] = [art.toLowerCase()]; // artículo realmente nuevo
      indiceArticulos[norm] = art;
      nuevosArticulos.push(art);
    }
  }

  // --- FUSIÓN de familias ---
  const nuevasFamilias = [];
  for (const fam of familiasCSV) {
    const norm = claveNormalizada(fam);
    const existente = indiceFamilias[norm];
    if (existente) {
      const sinonimo = fam.toLowerCase();
      if (!dicFamilias[existente].includes(sinonimo)) dicFamilias[existente].push(sinonimo);
    } else {
      dicFamilias[fam] = [fam.toLowerCase()];
      indiceFamilias[norm] = fam;
      nuevasFamilias.push(fam);
    }
  }

  // --- Artículos en el diccionario que YA NO están en la web (huérfanos) ---
  const normsCSV = new Set([...articulosCSV].map(claveNormalizada));
  const huerfanos = Object.keys(dicArticulos).filter(
    (k) => !normsCSV.has(claveNormalizada(k))
  );

  // --- Escritura ---
  fs.writeFileSync(
    path.join(DIR_DATA, "diccionarioArticulos.js"),
    serializarDiccionario(dicArticulos, "DICCIONARIO_ARTICULOS", "Fusión CSV web + sinónimos manuales")
  );
  fs.writeFileSync(
    path.join(DIR_DATA, "diccionarioFamilias.js"),
    serializarDiccionario(dicFamilias, "DICCIONARIO_FAMILIAS", "Fusión CSV web + sinónimos manuales")
  );
  escribirTxt("articulos.txt", "ARTICULOS", Object.keys(dicArticulos));
  escribirTxt("familias.txt", "FAMILIAS", Object.keys(dicFamilias));

  // --- Resumen ---
  console.log("\n✅ Fusión completada:");
  console.log(`   • Artículos en CSV (web)      : ${articulosCSV.size}`);
  console.log(`   • Artículos NUEVOS añadidos    : ${nuevosArticulos.length}`);
  console.log(`   • Total artículos en diccionario: ${Object.keys(dicArticulos).length}`);
  console.log(`   • Familias en CSV              : ${familiasCSV.size}`);
  console.log(`   • Familias NUEVAS añadidas      : ${nuevasFamilias.length}`);

  if (nuevosArticulos.length > 0) {
    console.log(`\n🆕 Artículos nuevos (sinónimo por defecto, conviene enriquecer a mano):`);
    console.log(`   ${nuevosArticulos.sort().join(", ")}`);
  }
  if (nuevasFamilias.length > 0) {
    console.log(`\n🆕 Familias nuevas:`);
    console.log(`   ${nuevasFamilias.sort().join(", ")}`);
  }
  if (huerfanos.length > 0) {
    console.log(
      `\n⚠️  ${huerfanos.length} artículo(s) en el diccionario que NO están en el CSV de la web (se han conservado, revísalos):`
    );
    console.log(`   ${huerfanos.sort().join(", ")}`);
  }
}

generar();
