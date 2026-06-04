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
    return tokensUsuario.some(
      (tok) => tok.length >= 2 && (catNorm.includes(tok) || tok.includes(catNorm))
    );
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

module.exports = { validarVehiculo, resolverMarca, modeloCoherenteConMarca };
