const { MAPA_VEHICULOS } = require("../data/mapaVehiculos");
const { DICCIONARIO_MARCAS } = require("../data/diccionarioMarcas");
const { textNormalize } = require("./textNormalizer");

/**
 * Índice inverso: sinónimo normalizado -> nombre canónico de marca tal como aparece
 * en MAPA_VEHICULOS. Permite resolver "vw" o "volky" a "VOLKSWAGEN".
 */
const INDICE_SINONIMOS_MARCA = {};
for (const [canonica, sinonimos] of Object.entries(DICCIONARIO_MARCAS)) {
  // La clave del mapa de vehículos está en mayúsculas; usamos esa como destino si existe.
  const destino = MAPA_VEHICULOS[canonica] ? canonica : canonica.toUpperCase();
  INDICE_SINONIMOS_MARCA[textNormalize(canonica)] = destino;
  (sinonimos || []).forEach((s) => {
    INDICE_SINONIMOS_MARCA[textNormalize(s)] = destino;
  });
}

// Índice normalizado de las propias claves del mapa (por si la marca llega ya canónica).
const CLAVES_MAPA_NORM = {};
for (const marca of Object.keys(MAPA_VEHICULOS)) {
  CLAVES_MAPA_NORM[textNormalize(marca)] = marca;
}

/**
 * Resuelve el texto de marca del usuario a su nombre canónico dentro de MAPA_VEHICULOS.
 * @param {string} marcaTexto
 * @returns {string|null} clave canónica del mapa o null si no se reconoce.
 */
const resolverMarca = (marcaTexto) => {
  if (!marcaTexto) return null;
  const norm = textNormalize(String(marcaTexto));
  return INDICE_SINONIMOS_MARCA[norm] || CLAVES_MAPA_NORM[norm] || null;
};

/**
 * Comprueba si el texto de modelo del usuario es coherente con la marca.
 * Usa coincidencia por tokens: el modelo del usuario ("golf") debe aparecer
 * dentro de algún nombre de modelo del catálogo de esa marca ("GOLF VII VARIANT").
 * @param {string} marcaCanonica - Clave ya resuelta del mapa.
 * @param {string} modeloTexto - Modelo en palabras del usuario.
 * @returns {boolean}
 */
const modeloCoherenteConMarca = (marcaCanonica, modeloTexto) => {
  if (!marcaCanonica || !modeloTexto) return true; // sin datos suficientes, no bloqueamos
  const catalogo = MAPA_VEHICULOS[marcaCanonica];
  if (!catalogo) return true;

  const modeloNorm = textNormalize(String(modeloTexto));
  if (!modeloNorm) return true;

  const tokensUsuario = modeloNorm.split(/\s+/).filter(Boolean);

  return Object.keys(catalogo).some((modeloCatalogo) => {
    const catNorm = textNormalize(modeloCatalogo);
    // Coincide si algún token del usuario está contenido en el modelo del catálogo
    // o al revés (cubre "golf" ⊂ "golf vii" y "golf vii" ⊃ "golf").
    return tokensUsuario.some((tok) => {
      if (tok.length === 0) return false;
      // Token corto (1 char): solo coincide si el modelo del catálogo ES exactamente ese token
      // o empieza por él seguido de espacio/paréntesis. Evita que "5" matchee "altea (5p1)".
      if (tok.length === 1) return catNorm === tok || catNorm.startsWith(tok + " ") || catNorm.startsWith(tok + "(");
      // Token normal (≥2 chars): coincidencia por substring en cualquier dirección
      return catNorm.includes(tok) || tok.includes(catNorm);
    });
  });
};

/**
 * Validación de coherencia marca↔modelo contra el catálogo real del desguace.
 * @param {string|null} marca
 * @param {string|null} modelo
 * @returns {{ marcaReconocida: boolean, marcaCanonica: string|null, modeloCoherente: boolean }}
 */
const validarVehiculo = (marca, modelo) => {
  const marcaCanonica = resolverMarca(marca);
  const marcaReconocida = !!marcaCanonica;

  // Solo evaluamos coherencia si conocemos la marca y hay un modelo que comprobar.
  const modeloCoherente =
    !marcaReconocida || !modelo
      ? true
      : modeloCoherenteConMarca(marcaCanonica, modelo);

  return { marcaReconocida, marcaCanonica, modeloCoherente };
};

/**
 * Índice inverso modelo→marcas, construido una sola vez al arrancar.
 * Para cada modelo del catálogo guarda qué marcas lo tienen.
 * Si un modelo aparece en una sola marca → se puede inferir automáticamente.
 */
// Solo indexamos marcas que están en nuestro diccionario de marcas soportadas.
// Filtra marcas oscuras (KUBA, AUVERLAND, KEEWAY como coche, etc.) que contaminarían la inferencia.
const MARCAS_SOPORTADAS = new Set(
  Object.keys(DICCIONARIO_MARCAS).map(k => {
    // Resolvemos la clave del diccionario a la clave canónica del mapa
    const norm = textNormalize(k);
    return INDICE_SINONIMOS_MARCA[norm] || k.toUpperCase();
  })
);

// Palabras comunes del español que coinciden con nombres de modelo del catálogo
// (ej: "baja" = KTM Baja 600). Nunca se usan para inferir vehículo desde el mensaje:
// "hacéis la baja de vehículos" no debe convertirse en un KTM Baja.
const TOKENS_MODELO_VETADOS = new Set(["baja", "campo"]);

const INDICE_MODELO_A_MARCAS = {};
for (const [marca, modelos] of Object.entries(MAPA_VEHICULOS)) {
  if (!MARCAS_SOPORTADAS.has(marca)) continue; // ignorar marcas no soportadas
  for (const modeloCatalogo of Object.keys(modelos)) {
    const primerToken = textNormalize(modeloCatalogo).split(/\s+/)[0];
    if (!primerToken || primerToken.length < 2) continue;
    if (TOKENS_MODELO_VETADOS.has(primerToken)) continue; // palabra común, no inferible
    if (!INDICE_MODELO_A_MARCAS[primerToken]) INDICE_MODELO_A_MARCAS[primerToken] = new Set();
    INDICE_MODELO_A_MARCAS[primerToken].add(marca);
  }
}

/**
 * Intenta inferir la marca a partir del modelo cuando el usuario no la ha indicado.
 * Solo devuelve marca si el modelo pertenece EXCLUSIVAMENTE a una sola marca en el catálogo.
 * @param {string} modeloTexto
 * @returns {string|null} nombre canónico de marca o null si hay ambigüedad
 */
const inferirMarcaDeModelo = (modeloTexto) => {
  if (!modeloTexto) return null;
  const primerToken = textNormalize(String(modeloTexto)).split(/\s+/)[0];
  if (!primerToken || primerToken.length < 2) return null;
  const marcasSet = INDICE_MODELO_A_MARCAS[primerToken];
  if (!marcasSet || marcasSet.size !== 1) return null; // ambiguo o desconocido
  return [...marcasSet][0];
};

/**
 * Comprueba si el texto dado aparece como token NO-primero en algún modelo del catálogo
 * de la marca indicada. Sirve para detectar trims/versiones (GTI, GTD, Sport, RS…)
 * que el usuario ha puesto en el campo modelo pero que no son modelos base.
 * @param {string} marcaCanonica
 * @param {string} textoModelo
 * @returns {boolean}
 */
const esPosibleVersion = (marcaCanonica, textoModelo) => {
  if (!marcaCanonica || !textoModelo) return false;
  const catalogo = MAPA_VEHICULOS[marcaCanonica];
  if (!catalogo) return false;
  const tok = textNormalize(String(textoModelo));
  if (!tok || tok.length < 2) return false;

  return Object.keys(catalogo).some((modeloCatalogo) => {
    const catTokens = textNormalize(modeloCatalogo).split(/\s+/);
    // Solo consideramos tokens que NO son el primero (el primero es el modelo base)
    return catTokens.slice(1).some(t => t === tok || t.includes(tok) || tok.includes(t));
  });
};

/**
 * Escanea el mensaje original del usuario buscando tokens que sean primer token
 * de un modelo conocido en el catálogo. Seguro porque usa el catálogo como whitelist.
 * @param {string} mensajeTexto - Mensaje original del usuario
 * @param {string|null} marcaTexto - Marca ya conocida (para acotar la búsqueda)
 * @returns {{ modelo: string, marcaInferida: string|null }|null}
 */
const buscarModeloEnMensaje = (mensajeTexto, marcaTexto) => {
  if (!mensajeTexto) return null;
  // Filtramos tokens cortos (≤2 chars) para descartar conectores: "mi", "un", "de"...
  const tokens = textNormalize(String(mensajeTexto)).split(/\s+/).filter(t => t.length >= 3);

  const marcaCanonica = marcaTexto ? resolverMarca(marcaTexto) : null;

  for (const token of tokens) {
    const marcasSet = INDICE_MODELO_A_MARCAS[token];
    if (!marcasSet || marcasSet.size === 0) continue;

    if (marcaCanonica) {
      if (marcasSet.has(marcaCanonica)) return { modelo: token, marcaInferida: null };
    } else {
      const marcaInferida = marcasSet.size === 1 ? [...marcasSet][0] : null;
      return { modelo: token, marcaInferida };
    }
  }
  return null;
};

/**
 * Intenta recuperar el modelo cuando el extractor metió "MODELO TRIM" entero en version.
 * Comprueba si el primer token de versionTexto es un modelo conocido en el catálogo.
 * @param {string} versionTexto - Valor del campo version (ej: "Golf GTD")
 * @param {string|null} marcaTexto - Marca conocida (para acotar la búsqueda)
 * @returns {{ modelo: string, version: string|null }|null}
 */
const extraerModeloDeVersion = (versionTexto, marcaTexto) => {
  if (!versionTexto) return null;
  const tokens = textNormalize(String(versionTexto)).split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  const primerToken = tokens[0];
  if (!primerToken || primerToken.length < 2) return null;

  const marcasSet = INDICE_MODELO_A_MARCAS[primerToken];
  if (!marcasSet || marcasSet.size === 0) return null;

  if (marcaTexto) {
    const marcaCanonica = resolverMarca(marcaTexto);
    if (marcaCanonica && !marcasSet.has(marcaCanonica)) return null;
  }

  return {
    modelo: primerToken,
    version: tokens.slice(1).join(" ") || null,
  };
};

module.exports = { validarVehiculo, resolverMarca, modeloCoherenteConMarca, inferirMarcaDeModelo, esPosibleVersion, extraerModeloDeVersion, buscarModeloEnMensaje };
