const { json } = require("express");
const { VALORES_NULOS } = require("../config/constants");

/**
 * Normaliza un valor para asegurar que "null" (string), undefined o "" 
 * se traten como un null real.
 * 
 * @param {any} val - El valor a normalizar.
 * @returns {string|null} - El valor normalizado o null si es inválido/vacío.
 */
const normalizar = (val) => {
  if (val === null || val === undefined) return null;
  const str = String(val).trim().toLowerCase();
  if (str === VALORES_NULOS.STRING_NULL || str === "" || str === VALORES_NULOS.VALOR_MEMORIA) return null;
  return val; 
};

/**
 * Fusiona el contexto anterior con el nuevo intent de la IA,
 * actuando como una red de seguridad para las reglas de negocio.
 * 
 * @param {string|Object} contextoAnterior - El estado previo en formato JSON o objeto.
 * @param {Object} nuevoIntent - El nuevo objeto extraído por la IA.
 * @returns {Object} - El nuevo estado consolidado y validado.
 */
const fusionarContexto = (contextoAnterior, nuevoIntent) => {
  let prev = {};
  try {
    prev = typeof contextoAnterior === 'string' ? JSON.parse(contextoAnterior) : (contextoAnterior || {});
  } catch (e) {
    prev = {};
  }

  const next = nuevoIntent || {};

  // 1. Detectar cambios fundamentales
  const nextArticulo = normalizar(next.articulo);
  const prevArticulo = normalizar(prev.articulo);
  const articuloCambiado = nextArticulo !== null && prevArticulo !== null && nextArticulo.toLowerCase() !== prevArticulo.toLowerCase();

  const nextMarca = normalizar(next.marca);
  const prevMarca = normalizar(prev.marca);
  const marcaCambiada = nextMarca !== null && prevMarca !== null && nextMarca.toLowerCase() !== prevMarca.toLowerCase();

  const nextModelo = normalizar(next.modelo);
  const prevModelo = normalizar(prev.modelo);
  const modeloCambiado = nextModelo !== null && prevModelo !== null && nextModelo.toLowerCase() !== prevModelo.toLowerCase();

  const vehiculoCambiado = marcaCambiada || modeloCambiado;

  // 2. Aplicar lógica de herencia y limpieza según reglas de negocio
  
  // ARTICULO: Priorizar el nuevo, si no existe rescatar el viejo
  let articulo = nextArticulo || prevArticulo;

  // REFERENCIA: Si cambia el artículo o el vehículo, la referencia vieja queda invalidada
  let referencia = normalizar(next.referencia);
  if (!referencia && (articuloCambiado || vehiculoCambiado)) {
    referencia = null;
  } else if (!referencia) {
    referencia = normalizar(prev.referencia);
  }

  // MARCA / MODELO: Herencia estándar
  let marca = nextMarca || prevMarca;
  let modelo = nextModelo || prevModelo;

  // AÑO: Herencia estándar (Incluso si cambia el vehículo, se mantiene en JSON por regla 2)
  let ano = normalizar(next.ano) || normalizar(prev.ano);

  // VERSIÓN: Reset obligatorio si cambia el vehículo
  let version = normalizar(next.version);
  if (vehiculoCambiado) {
    version = next.version ? normalizar(next.version) : null; 
  } else if (!version) {
    version = normalizar(prev.version);
  }

  const datosFinales = {
    articulo,
    referencia,
    marca,
    modelo,
    ano,
    version
  };

  // Retornamos combinando con el intent (para no perder _razonamiento ni realizar_busqueda)
  return { ...next, ...datosFinales };
};

module.exports = { fusionarContexto, normalizar };
