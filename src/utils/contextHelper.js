const { VALORES_NULOS } = require("../config/constants");

const normalizar = (val) => {
  if (val === null || val === undefined) return null;
  const str = String(val).trim().toLowerCase();
  if (str === VALORES_NULOS.STRING_NULL || str === "" || str === VALORES_NULOS.VALOR_MEMORIA) return null;
  return val;
};

const fusionarContexto = (contextoAnterior, nuevoIntent) => {
  let prev = {};
  try {
    prev = typeof contextoAnterior === 'string' ? JSON.parse(contextoAnterior) : (contextoAnterior || {});
  } catch (e) {
    prev = {};
  }

  const next = nuevoIntent || {};
  const campos = ["articulo", "marca", "modelo", "ano", "version", "referencia"];
  const old = {};
  const current = {};
  
  campos.forEach(campo => {
    old[campo] = normalizar(prev[campo]);
    current[campo] = normalizar(next[campo]);
  });

  let final = { ...old };

  // CASOS DE CASCADA

  // CASO A: Referencia OEM -> Borra todo lo demás
  if (current.referencia && current.referencia !== old.referencia) {
    return {
      contexto: {
        articulo: null, marca: null, modelo: null, 
        ano: null, version: null, referencia: current.referencia
      },
      realizarBusqueda: true
    };
  }

  // CASO B: Cambio de Marca -> Resetea todo lo que va por debajo
  if (current.marca && current.marca !== old.marca) {
    final.marca = current.marca;
    final.modelo = current.modelo || null; // Por si dice "BMW Serie 3" de golpe
    final.ano = null;
    final.version = null;
    final.referencia = null;
  } 
  // CASO C: Cambio de Modelo -> Mantiene marca, resetea lo que va por debajo
  else if (current.modelo && current.modelo !== old.modelo) {
    final.modelo = current.modelo;
    // Mantenemos final.marca heredado
    final.ano = null;
    final.version = null;
    final.referencia = null;
  }

  // CASO D: Cambio de Artículo -> Mantiene el coche entero, solo borra la referencia
  if (current.articulo && current.articulo !== old.articulo) {
    final.articulo = current.articulo;
    final.referencia = null; 
  }

  //  ACTUALIZACIÓN DE RESTO DE DATOS

  if (current.ano) final.ano = current.ano;
  if (current.version) final.version = current.version;

  return { 
    contexto: final, 
    realizarBusqueda: true
  };
};

module.exports = { fusionarContexto, normalizar };