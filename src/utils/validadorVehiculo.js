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

  // Coincidencia fiable: la entrada del catálogo debe contener el token del usuario
  // Y tener al menos 3 caracteres (evita falsos positivos con "G", "Z", "A", etc.).
  const coincideEnCatalogo = (modelos) =>
    Object.keys(modelos).some((mc) => {
      const catNorm = textNormalize(mc);
      return catNorm.length >= 3 && tokensUsuario.some(
        (tok) => tok.length >= 2 && catNorm.includes(tok)
      );
    });

  // Si el modelo está en el catálogo de ESTA marca → coherente.
  if (coincideEnCatalogo(catalogo)) return true;

  // Los tokens puramente numéricos/alfanuméricos (ej: "320d", "116", "2.0") son
  // códigos de variante, no nombres de modelo. No los cruzamos con otras marcas
  // porque el catálogo tiene entradas como "E 320" o "PEUGEOT 320" que provocarían
  // falsos rechazos. Si el token no aparece en ESTA marca lo aceptamos sin más.
  const soloCodigosTecnicos = tokensUsuario.every(tok => /\d/.test(tok));
  if (soloCodigosTecnicos) return true;

  // Para nombres propios (Golf, Laguna, Focus, Ibiza…) sí cruzamos con otras marcas.
  // Si el nombre pertenece claramente a otra marca → rechazar.
  const enOtraMarca = Object.entries(MAPA_VEHICULOS).some(
    ([marca, modelos]) => marca !== marcaCanonica && coincideEnCatalogo(modelos)
  );
  return !enOtraMarca;
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
 * Dado un modelo, busca en TODOS los catálogos qué marcas lo tienen.
 * Si exactamente UNA marca lo contiene → la devuelve en minúsculas.
 * Si ninguna o varias la contienen → devuelve null (no autocompletamos).
 *
 * Esto permite que "ibiza" → "seat", "golf" → "volkswagen", "laguna" → "renault",
 * pero "serie 3" no devuelva nada si apareciera en varias marcas, y que
 * "320d" (variante no registrada) tampoco devuelva nada.
 */
const autocompletarMarca = (modeloTexto) => {
  if (!modeloTexto) return null;
  const modeloNorm = textNormalize(String(modeloTexto));
  const tokensModelo = modeloNorm.split(/\s+/).filter(Boolean);

  const marcasCompatibles = Object.entries(MAPA_VEHICULOS)
    .filter(([, modelos]) =>
      Object.keys(modelos).some((mc) => {
        const catNorm = textNormalize(mc);
        // Solo sentido catálogo→usuario (el catálogo contiene el token del usuario).
        // Mínimo 3 chars en ambos para no matchear "Z", "G", etc.
        return catNorm.length >= 3 && tokensModelo.some(
          (tok) => tok.length >= 2 && catNorm.includes(tok)
        );
      })
    )
    .map(([marca]) => marca);

  return marcasCompatibles.length === 1 ? marcasCompatibles[0].toLowerCase() : null;
};

module.exports = { validarVehiculo, resolverMarca, modeloCoherenteConMarca, autocompletarMarca };
