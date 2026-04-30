const crypto = require("crypto");

const generarClaveCache = (parametrosBusqueda) => {
  if (!parametrosBusqueda || typeof parametrosBusqueda !== "object") {
    return null;
  }

  const objetoNormalizado = {};

  Object.keys(parametrosBusqueda)
    .sort()
    .forEach((key) => {
      const valor = parametrosBusqueda[key];

      if (Array.isArray(valor)) {
        objetoNormalizado[key] = [...valor].sort();
      } else {
        objetoNormalizado[key] = valor;
      }
    });

  const stringOrdenado = JSON.stringify(objetoNormalizado);

  const hashUnico = crypto
    .createHash("md5")
    .update(stringOrdenado)
    .digest("hex");

  return `busqueda_${hashUnico}`;
};

module.exports = { generarClaveCache };
