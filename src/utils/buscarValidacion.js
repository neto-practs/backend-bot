const evaluarContexto = (query, desglose) => {
  if (desglose.referencias && desglose.referencias.length > 0) {
    return {
      esValido: true,
      respuesta: null,
    };
  }

  //No hay query en absoluto
  if (!query || query.trim() === "") {
    return {
      esValido: false,
      respuesta:
        "Entiendo que buscas una pieza, pero no he logrado reconocer cual es. ¿Puedes decirme la marca, el modelo y la pieza exacta?",
    };
  }

  //Faltan artículos/familias, pero tenemos algo de coche
  if (desglose.articulo.length === 0 && desglose.familias.length === 0) {
    const hayMarca = desglose.marcas.length > 0;
    const hayModelo = desglose.modelos.length > 0;

    if (!hayMarca && hayModelo) {
      const modeloStr = desglose.modelos.join(" ").toUpperCase();
      return {
        esValido: false,
        respuesta: `Por lo que he entendido buscas el modelo: ${modeloStr}. Me faltan la marca y el articulo. Por favor, envie un mensaje que contenga todo lo necesario (por ejemplo: 'Faro izquierdo Audi Coupe').`,
      };
    }

    if (hayMarca && !hayModelo) {
      const marcaStr = desglose.marcas.join(" ").toUpperCase();
      return {
        esValido: false,
        respuesta: `Por lo que he entendido buscas de la marca: ${marcaStr}. Me faltan el modelo y el articulo. Por favor, envie un mensaje que contenga todo lo necesario (por ejemplo: 'faro ${marcaStr.toLowerCase()} modelo').`,
      };
    }

    if (hayMarca && hayModelo) {
      const vehiculo = [...desglose.marcas, ...desglose.modelos]
        .join(" ")
        .toUpperCase();
      return {
        esValido: false,
        respuesta: `Por lo que he entendido buscas recambios para el vehiculo: ${vehiculo}. Me falta el articulo que necesitas. Por favor, envie un mensaje que contenga todo lo necesario (por ejemplo: 'faro ${vehiculo.toLowerCase()}').`,
      };
    }
  }

  return { esValido: true, respuesta: null };
};

module.exports = { evaluarContexto };
