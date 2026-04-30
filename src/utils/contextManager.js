const fusionarContextosInteligente = (analisisViejo, analisisNuevo) => {

  const nuevo = analisisNuevo.desglose || {};
  const viejo = analisisViejo.desglose || {};

  const artNuevo = nuevo.articulo || [];
  const artViejo = viejo.articulo || [];

  const modificadores = ["izquierdo", "derecho", "delantero", "trasero", "interior", "exterior", "superior", "inferior", "manual", "automatico", "electrico", "izq", "der"];

  // SEPARAMOS LA PIEZA DE SUS MODIFICADORES
  const modsViejos = artViejo.filter(mod => modificadores.includes(mod));
  const modsNuevos = artNuevo.filter(mod => modificadores.includes(mod));
  
  let modsFinales = [];
  if (modsNuevos.length > 0) {
    // Si entran modificadores nuevos, sustituyen a los opuestos viejos
    const lados = ["izquierdo", "derecho", "izq", "der"];
    const posiciones = ["delantero", "trasero", "superior", "inferior", "interior", "exterior"];
    
    const newHasLado = modsNuevos.some(m => lados.includes(m));
    const newHasPosicion = modsNuevos.some(m => posiciones.includes(m));

    modsFinales = modsViejos.filter(m => {
      if (newHasLado && lados.includes(m)) return false;
      if (newHasPosicion && posiciones.includes(m)) return false;
      return true;
    }).concat(modsNuevos);
  } else {
    // Si no dice lado nuevo, conservamos el viejo ("faro" mantiene "delantero izquierdo")
    modsFinales = modsViejos;
  }

  const piezasNuevas = artNuevo.filter(art => !modificadores.includes(art));
  const piezasViejas = artViejo.filter(art => !modificadores.includes(art));

  // Si hay una pieza principal nueva, machaca la vieja.
  const mainFinal = piezasNuevas.length > 0 ? piezasNuevas : piezasViejas;
  
  // Reensamblamos el artículo
  const articulo = [...mainFinal, ...modsFinales];
  const esSoloModificador = piezasNuevas.length === 0 && modsNuevos.length > 0;

  // LÓGICA EN CASCADA (Marca -> Modelo -> Versión -> Referencia)
  let marcas = viejo.marcas || [];
  let modelos = viejo.modelos || [];
  let versiones = viejo.versiones || [];
  let referencias = viejo.referencias || [];

  if (nuevo.marcas?.length > 0) {
    marcas = nuevo.marcas;
    modelos = nuevo.modelos || [];
    versiones = nuevo.versiones || [];
    referencias = nuevo.referencias || [];
  } else if (nuevo.modelos?.length > 0) {
    modelos = nuevo.modelos;
    versiones = nuevo.versiones || [];
    referencias = nuevo.referencias || [];
  } else if (nuevo.versiones?.length > 0) {
    versiones = [...versiones, ...nuevo.versiones];
  }

  if (nuevo.referencias?.length > 0) {
    referencias = nuevo.referencias;
  }
  
  const familias = nuevo.familias?.length > 0 ? nuevo.familias : (viejo.familias || []);

  // STRING FINAL
  const arrayFinal = [...articulo, ...marcas, ...familias, ...modelos, ...referencias, ...versiones];
  const textoFusionado = [...new Set(arrayFinal)].filter(Boolean).join(" ").trim();

  const cambioArticulo = piezasNuevas.length > 0 && piezasViejas.length > 0 && !piezasNuevas.some(art => piezasViejas.includes(art));

  return {
    textoFusionado,
    fueReset: cambioArticulo,
  };
};

module.exports = { fusionarContextosInteligente };