const formatearParaReact = (arrayPiezas, storeUrl) => {
  // El storeUrl del cliente manda; el env/default solo es un último recurso.
  // Quitamos la barra final para no generar URLs con doble barra (//recambios/).
  const STORE_URL = (
    storeUrl ||
    process.env.STORE_BASE_URL ||
    "https://dev4premium.desguacesyrecambios.com"
  ).replace(/\/$/, "");

  return arrayPiezas.map((pieza) => {
    const datosCoche = [pieza.marca, pieza.modelo]
      .filter((dato) => dato && dato !== "SIN DEFINIR")
      .join(" ");

    const titulo = `${pieza.articulo} ${datosCoche}`.trim().toUpperCase();

    //Nos aseguramos de que hay identificador
    const identificador = pieza.url || pieza.idPost || pieza.reflocal;

    // Limpiamos las // que nos puedan dar error
    const finalUrlLimpio = identificador.toString().replace(/\//g, "");

    const linkCompra = `${STORE_URL}/recambios/${finalUrlLimpio}/`;

    return {
      id: pieza.idPost || pieza.reflocal,
      titulo,
      precio: pieza.precio ? `${pieza.precio}€` : "Consultar",
      imagen: pieza.imagen,
      url: linkCompra,
    };
  });
};

module.exports = { formatearParaReact };
