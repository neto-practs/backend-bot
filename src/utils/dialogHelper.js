/**
 * Genera el texto de respuesta exacto evaluando los vacíos en el estado (NLU).
 * Sigue la cascada estricta: articulo > marca > modelo > año > version > referencia
 * * @param {Object} ctx - El JSON extraído por la IA
 * @returns {string} - El mensaje que leerá el usuario
 */
const generarRespuestaUsuario = (ctx) => {
  // Helper para recordar datos parciales sin sonar tonto
  const construirExtra = () => {
    let partes = [];
    if (ctx.modelo) partes.push(ctx.modelo);
    if (ctx.ano) partes.push(`del ${ctx.ano}`);
    if (ctx.version) partes.push(`motor ${ctx.version}`);
    return partes.length > 0 ? ` (${partes.join(" ")})` : "";
  };

  // 1. CORTAFUEGOS DE REFERENCIA OEM:
  // Si el usuario nos ha dado una referencia directamente, es un "Fast-Track"
  if (ctx.referencia) {
    const pieza = ctx.articulo ? ctx.articulo : "piezas";
    return `¡Perfecto! Buscando directamente por la referencia OEM ${ctx.referencia}.`;
  }

  const pieza = ctx.articulo || "la pieza";
  const extraInfo = construirExtra();

  // 2. CASCADA DE PRIORIDADES ESTRICTA
  if (!ctx.articulo) {
    return "¿Qué pieza o recambio estás buscando exactamente?";
  }

  if (!ctx.marca) {
    return `Anotado: ${pieza}${extraInfo}. Para poder buscarlo, ¿de qué marca es el vehículo (ej. Seat, Audi)?`;
  }

  if (!ctx.modelo) {
    const extraSinModelo =
      ctx.ano || ctx.version
        ? ` (${[ctx.ano, ctx.version].filter(Boolean).join(" ")})`
        : "";
    return `Buscando ${pieza} para ${ctx.marca}${extraSinModelo}. ¿Cuál es el modelo exacto (ej. Ibiza, Leon)?`;
  }

  // --- (Artículo + Marca + Modelo) ---

  if (!ctx.ano) {
    return `¡Genial! Buscando ${pieza} para tu ${ctx.marca} ${ctx.modelo}. Para asegurar la compatibilidad, ¿de qué año es?`;
  }

  if (!ctx.version) {
    return `Ya casi lo tenemos: ${pieza} para tu ${ctx.marca} ${ctx.modelo} del ${ctx.ano}. ¿Qué version o motor tiene (ej. 1.6, 1.9 TDI)?`;
  }

  if (!ctx.referencia) {
    return `Tengo todos los datos: ${pieza} para ${ctx.marca} ${ctx.modelo} ${ctx.version} (${ctx.ano}). Para ir a tiro hecho y no fallar, ¿tienes la referencia exacta de la pieza?.`;
  }

  // BUSQUEDA COMPLETADA AL 100%
  return `¡Búsqueda lista y afinada al máximo! Mostrando resultados para tu ${ctx.marca} ${ctx.modelo}. ¿Te puedo ayudar buscando otra pieza diferente?`;
};

module.exports = { generarRespuestaUsuario };
