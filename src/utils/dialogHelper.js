const capitalizar = (str) =>
  str ? str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : str;

/**
 * Determina cuál es el siguiente paso vacío en la cascada.
 * Exportamos esto para que aiService sepa de qué buscar sugerencias en la base de datos.
 */
const determinarCampoFaltante = (ctx) => {
  if (!ctx.articulo) return "articulo";
  if (!ctx.marca) return "marca";
  if (!ctx.modelo) return "modelo";
  if (!ctx.ano) return "ano";
  if (!ctx.version) return "version";
  return null; // Si devuelve null, es que la cascada está completa
};

/**
 * Genera el texto de respuesta exacto evaluando los vacíos en el estado (NLU).
 * @param {Object} ctx - El JSON extraído por la IA
 * @returns {string} - El mensaje que leerá el usuario
 */
const generarRespuestaUsuario = (ctx) => {
  const getFraseRandom = (array) => array[Math.floor(Math.random() * array.length)];

  // Helper para recordar datos parciales sin sonar tonto
  const construirExtra = () => {
    let partes = [];
    if (ctx.modelo) partes.push(ctx.modelo);
    if (ctx.ano) partes.push(`del ${ctx.ano}`);
    if (ctx.version) partes.push(`motor ${ctx.version}`);
    return partes.length > 0 ? ` (${partes.join(" ")})` : "";
  };

  // REFERENCIA OEM 
  if (ctx.referencia) {
    const arrReferencia = [
      `¡Perfecto! Buscando directamente por la referencia OEM ${ctx.referencia}.`,
      `¡Genial! Con la referencia ${ctx.referencia} iremos directos al grano.`,
      `Procesando búsqueda rápida en el almacén con la referencia ${ctx.referencia}...`,
      `Anotado. Voy a consultar stock para la referencia exacta: ${ctx.referencia}.`
    ];
    return getFraseRandom(arrReferencia);
  }

  const pieza = ctx.articulo || "este recambio";
  const marca = capitalizar(ctx.marca);
  const modelo = capitalizar(ctx.modelo);
  const extraInfo = construirExtra();

  // AVERIGUAMOS QUÉ FALTA EN LA CASCADA
  const campoFaltante = determinarCampoFaltante(ctx);

  // GENERAMOS LA FRASE SEGÚN EL CAMPO QUE FALTA 
  switch (campoFaltante) {
    case "articulo":
      if (ctx.marca) {
        const vehiculo = [marca, modelo].filter(Boolean).join(" ");
        const arrConMarca = [
          `Veo que buscas recambios para un ${vehiculo}. ¿Qué pieza o referencia necesitas exactamente?`,
          `¡Perfecto, un ${vehiculo}! ¿Qué pieza estás buscando para él?`,
          `Tengo anotado que es un ${vehiculo}. ¿Me dices qué recambio te hace falta?`,
          `Para tu ${vehiculo}, ¿qué pieza o referencia OEM necesitas que busque?`
        ];
        return getFraseRandom(arrConMarca);
      }
      const arrNoArticulo = [
        "¿Qué pieza o referencia OEM estás buscando exactamente?",
        "¡Hola! Dime, ¿qué recambio necesitas para tu vehículo?",
        "¿En qué pieza te puedo ayudar a buscar hoy?",
        "Para empezar a buscar, ¿me podrías indicar qué pieza necesitas?"
      ];
      return getFraseRandom(arrNoArticulo);

    case "marca":
      const arrNoMarca = [
        `Anotado: buscar ${pieza}${extraInfo}. Para poder afinar, ¿de qué marca es el vehículo?`,
        `¡Perfecto! Buscaremos ${pieza}${extraInfo}. ¿Me dices la marca del coche?`,
        `Para asegurarme de realizar una buena búsqueda de ${pieza}${extraInfo}, ¿qué marca es?`,
        `Ya tengo apuntado que buscas ${pieza}${extraInfo}. ¿Para qué marca lo necesitas?`
      ];
      return getFraseRandom(arrNoMarca);

    case "modelo":
      const extraSinModelo = ctx.ano || ctx.version ? ` (${[ctx.ano, ctx.version].filter(Boolean).join(" ")})` : "";
      const arrNoModelo = [
        `Buscando ${pieza} para ${marca}${extraSinModelo}. ¿Cuál es el modelo exacto?`,
        `¡Genial, un ${marca}! ¿Me indicas el modelo para buscar ${pieza}${extraSinModelo}?`,
        `Para afinar la búsqueda de ${pieza} en tu ${marca}${extraSinModelo}, ¿qué modelo es?`,
        `Tengo la marca (${marca}), pero me falta el modelo exacto para encontrar ${pieza}${extraSinModelo}.`
      ];
      return getFraseRandom(arrNoModelo);

    case "ano":
      const arrNoAno = [
        `¡Genial! Buscando ${pieza} para tu ${marca} ${modelo}. Para afinar más la búsqueda, ¿de qué año es?`,
        `Estupendo, un ${marca} ${modelo}. ¿De qué año de fabricación estamos hablando para buscar ${pieza}?`,
        `Ya casi lo tenemos. Necesitaría el año de tu ${marca} ${modelo} para no fallar con la busqueda de ${pieza}.`,
        `Para darte opciones válidas de ${pieza} para tu ${marca} ${modelo}, ¿sabrías decirme el año?`
      ];
      return getFraseRandom(arrNoAno);

    case "version":
      const arrNoVersion = [
        `Ya casi lo tenemos: ${pieza} para tu ${marca} ${modelo} del ${ctx.ano}. ¿Qué versión tiene?`,
        `Perfecto, ${marca} ${modelo} del ${ctx.ano}. Para afinar al 100%, ¿me dices la versión del vehiculo?`,
        `Solo un dato más: ¿De que versión es tu ${marca} ${modelo} del ${ctx.ano}?`,
        `Último paso para encontrar tu ${pieza}: ¿Cual es la versión de tu ${marca} ${modelo} del ${ctx.ano}?`
      ];
      return getFraseRandom(arrNoVersion);

    default:
      // Si campoFaltante es null, la cascada está COMPLETADA al 100%
      let resumenParametros = `${pieza} para ${marca} ${modelo}`;
      if (ctx.version) resumenParametros += ` ${ctx.version}`;
      if (ctx.ano) resumenParametros += ` del ${ctx.ano}`;

      const arrCompletado = [
        `¡Búsqueda lista y afinada al máximo! Mostrando resultados de ${resumenParametros}. ¿Te puedo ayudar buscando otra pieza diferente?`,
        `¡Genial! Ya he lanzado la búsqueda de ${resumenParametros}. ¿Necesitas algo más?`,
        `Perfecto, aquí tienes los resultados de ${resumenParametros}. ¿Hay alguna otra pieza que busques?`
      ];
      return getFraseRandom(arrCompletado);
  }
};

module.exports = { generarRespuestaUsuario, determinarCampoFaltante };