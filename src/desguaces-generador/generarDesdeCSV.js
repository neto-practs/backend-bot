/**
 * GENERADOR MAESTRO DESDE CSV
 * ---------------------------------------------------------------------------
 * Lee el listado completo de vehículos (MARCA;MODELO;VERSION;MOTOR;AÑO) y genera:
 *   1. src/data/mapaVehiculos.js       → jerarquía { MARCA: { MODELO: [versiones] } }
 *   2. src/data/diccionarioModelos.js  → { "MODELO": ["modelo"] }  (formato existente)
 *   3. src/data/diccionarioVersiones.js→ [ "version", ... ]        (formato existente)
 *
 * Uso:
 *   node src/desguaces-generador/generarDesdeCSV.js "C:\\ruta\\al\\LISTADO.csv"
 * Si no se pasa ruta, usa la del Escritorio por defecto.
 *
 * El CSV NO tiene cabecera. Separador ";". Campos entre comillas y con padding
 * de espacios en la marca. Las filas basura ("» OTROS...") se descartan.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// --- Configuración de rutas -------------------------------------------------
const RUTA_CSV =
  process.argv[2] ||
  path.join(os.homedir(), "Desktop", "LISTADO VEHICULOS COMPLETO.csv");

const DIR_DATA = path.join(__dirname, "..", "data");

// --- Helpers ----------------------------------------------------------------

/** Quita comillas envolventes, espacios de padding y normaliza espacios internos. */
const limpiarCampo = (valor) => {
  if (valor === undefined || valor === null) return "";
  return String(valor)
    .replace(/^﻿/, "") // BOM
    .replace(/^"+|"+$/g, "") // comillas envolventes
    .replace(/\s+/g, " ") // colapsa espacios múltiples
    .trim();
};

/** True si el valor es basura o nulo que no debe entrar en los diccionarios. */
const esValorInvalido = (valor) => {
  if (!valor) return true;
  const v = valor.toUpperCase();
  return (
    v === "NULL" ||
    v === "0" ||
    v.startsWith("»") ||
    v.startsWith("MODELOS") && v.length <= 7 // cabecera residual "MODELOS"
  );
};

/** Parser de línea CSV simple para separador ";" con campos opcionalmente entrecomillados. */
const parsearLinea = (linea) => {
  // Como los campos pueden contener comas pero NO ";" sin comillas en este dataset,
  // un split por ";" respetando comillas es suficiente y robusto.
  const campos = [];
  let actual = "";
  let dentroComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      dentroComillas = !dentroComillas;
      continue;
    }
    if (c === ";" && !dentroComillas) {
      campos.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  campos.push(actual);
  return campos;
};

// --- Proceso principal ------------------------------------------------------

function generar() {
  if (!fs.existsSync(RUTA_CSV)) {
    console.error(`❌ No se encuentra el CSV en: ${RUTA_CSV}`);
    console.error(`   Pásalo como argumento: node generarDesdeCSV.js "ruta/al/archivo.csv"`);
    process.exit(1);
  }

  console.log(`📖 Leyendo: ${RUTA_CSV}`);
  const contenido = fs.readFileSync(RUTA_CSV, "utf8");
  const lineas = contenido.split(/\r?\n/);

  // Estructuras de salida
  const mapa = {}; // { MARCA: { MODELO: Set(versiones) } }
  const modelosSet = new Set(); // nombres de modelo (en mayúsculas)
  const versionesSet = new Set(); // versiones (en minúsculas)
  const marcasSet = new Set();

  let totalFilas = 0;
  let descartadas = 0;

  for (const lineaCruda of lineas) {
    if (!lineaCruda || !lineaCruda.trim()) continue;

    const campos = parsearLinea(lineaCruda);
    const marca = limpiarCampo(campos[0]).toUpperCase();
    const modelo = limpiarCampo(campos[1]).toUpperCase();
    const version = limpiarCampo(campos[2]);

    // La marca y el modelo son obligatorios para construir la jerarquía
    if (esValorInvalido(marca) || esValorInvalido(modelo)) {
      descartadas++;
      continue;
    }

    totalFilas++;
    marcasSet.add(marca);
    modelosSet.add(modelo);

    if (!mapa[marca]) mapa[marca] = {};
    if (!mapa[marca][modelo]) mapa[marca][modelo] = new Set();

    if (!esValorInvalido(version)) {
      const versionLimpia = version.toLowerCase();
      mapa[marca][modelo].add(versionLimpia);
      versionesSet.add(versionLimpia);
    }
  }

  // --- Serializar mapaVehiculos.js ------------------------------------------
  const mapaSerializable = {};
  for (const marca of Object.keys(mapa).sort()) {
    mapaSerializable[marca] = {};
    for (const modelo of Object.keys(mapa[marca]).sort()) {
      mapaSerializable[marca][modelo] = Array.from(mapa[marca][modelo]).sort();
    }
  }

  const contenidoMapa =
    `// Archivo generado automáticamente desde el CSV - No editar a mano\n` +
    `// Estructura: { "MARCA": { "MODELO": ["version", ...] } }\n` +
    `const MAPA_VEHICULOS = ${JSON.stringify(mapaSerializable, null, 2)};\n\n` +
    `module.exports = { MAPA_VEHICULOS };\n`;
  fs.writeFileSync(path.join(DIR_DATA, "mapaVehiculos.js"), contenidoMapa);

  // --- Serializar diccionarioModelos.js (formato { NOMBRE: ["nombre"] }) ----
  const dicModelos = {};
  Array.from(modelosSet)
    .sort()
    .forEach((m) => {
      dicModelos[m] = [m.toLowerCase()];
    });
  const contenidoModelos =
    `// Archivo generado automáticamente desde el CSV - No editar a mano\n` +
    `const DICCIONARIO_MODELOS = ${JSON.stringify(dicModelos, null, 2)};\n\n` +
    `module.exports = { DICCIONARIO_MODELOS };\n`;
  fs.writeFileSync(path.join(DIR_DATA, "diccionarioModelos.js"), contenidoModelos);

  // --- Serializar diccionarioVersiones.js (formato array) -------------------
  // Filtramos versiones que coincidan exactamente con un modelo o marca para no duplicar.
  const marcasYModelosLower = new Set(
    [...marcasSet, ...modelosSet].map((t) => t.toLowerCase())
  );
  const versionesFinales = Array.from(versionesSet)
    .filter((v) => !marcasYModelosLower.has(v))
    .sort();
  const contenidoVersiones =
    `// Archivo generado automáticamente desde el CSV - No editar a mano\n` +
    `const DICCIONARIO_VERSIONES = ${JSON.stringify(versionesFinales, null, 2)};\n\n` +
    `module.exports = { DICCIONARIO_VERSIONES };\n`;
  fs.writeFileSync(
    path.join(DIR_DATA, "diccionarioVersiones.js"),
    contenidoVersiones
  );

  // --- Aviso de marcas del CSV que no están en el diccionario de sinónimos ---
  let marcasFaltantes = [];
  try {
    const { DICCIONARIO_MARCAS } = require("../data/diccionarioMarcas");
    const marcasConocidas = new Set(Object.keys(DICCIONARIO_MARCAS).map((m) => m.toUpperCase()));
    marcasFaltantes = Array.from(marcasSet).filter((m) => !marcasConocidas.has(m));
  } catch (_) {
    /* si no existe, lo ignoramos */
  }

  // --- Resumen --------------------------------------------------------------
  console.log("\n✅ Generación completada:");
  console.log(`   • Filas válidas procesadas : ${totalFilas}`);
  console.log(`   • Filas descartadas        : ${descartadas}`);
  console.log(`   • Marcas                   : ${marcasSet.size}`);
  console.log(`   • Modelos únicos           : ${modelosSet.size}`);
  console.log(`   • Versiones únicas         : ${versionesFinales.length}`);
  console.log(`\n📁 Archivos escritos en ${DIR_DATA}:`);
  console.log(`   • mapaVehiculos.js`);
  console.log(`   • diccionarioModelos.js`);
  console.log(`   • diccionarioVersiones.js`);

  if (marcasFaltantes.length > 0) {
    console.log(
      `\n⚠️  ${marcasFaltantes.length} marca(s) del CSV no están en diccionarioMarcas.js (añade sus sinónimos a mano):`
    );
    console.log(`   ${marcasFaltantes.join(", ")}`);
  }
}

generar();
