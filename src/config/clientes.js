// CÓMO AÑADIR UN NUEVO CLIENTE:
//
// 1. CLAVE DEL OBJETO: URL exacta desde donde el usuario carga el chat en su navegador.
//    Normalmente es la web donde está instalado el plugin de WordPress (con https://, sin barra final).
//    El backend la usa para validar CORS: rechaza cualquier petición que no venga de un origen registrado aquí.
//
// 2. storeUrl: URL base donde está la API de piezas (WooCommerce/DesguacesV8) del cliente.
//    En la mayoría de casos coincide con la clave del objeto porque el chat y la tienda
//    están en el mismo dominio. Pero si el cliente tiene el chat en una web y la tienda
//    en otra (ej: "desguace.com" y "tienda.desguace.com"), aquí va la URL de la tienda.
//
// 3. backendApiKey: contraseña secreta compartida entre el backend y el plugin de WordPress.
//    Debe coincidir con la API_KEY configurada en el plugin. Usar una clave distinta por cliente.

const CLIENTES = {
  "https://dev4premium.desguacesyrecambios.com": {
    id: "cliente_001_premium",
    storeUrl: "https://dev4premium.desguacesyrecambios.com",
    backendApiKey: "12345",
  },

  "https://desguacesmelli.com": {
    id: "cliente_002_premium",
    storeUrl: "https://desguacesmelli.com/",
    backendApiKey: "12345",
  },

  "https://automocionescatoira.com": {
    id: "cliente_003_premium",
    storeUrl: "https://automocionescatoira.com/",
    backendApiKey: "pwh5ijLYT1K5",
  },

  "https://desguacealegre.es": {
    id: "cliente_004_premium",
    storeUrl: "https://desguacealegre.es/",
    backendApiKey: "970lkQc6oDGh",
  },

  "https://desguacespalomino.com": {
    id: "cliente_005_premium",
    storeUrl: "https://desguacespalomino.com/",
    backendApiKey: "THg9DHl1L5i4",
  },

  "https://desguacesvilanova.com": {
    id: "cliente_006_premium",
    storeUrl: "https://desguacesvilanova.com/",
    backendApiKey: "PvPWhQ66J4am",
  },


  "https://desguacemiguel.es": {
    id: "cliente_007_premium",
    storeUrl: "https://desguacemiguel.es/",
    backendApiKey: "vEAhpl8zQC53",
  },


  "https://rebagliato.com": {
    id: "cliente_008_premium",
    storeUrl: "https://rebagliato.com/",
    backendApiKey: "uII7nu41rYL9",
  },


  "https://reciclaperezoso.com": {
    id: "cliente_009_premium",
    storeUrl: "https://reciclaperezoso.com/",
    backendApiKey: "UYnV1sk9q2j5",
  },


  "https://desguaceselitaliano.com": {
    id: "cliente_010_premium",
    storeUrl: "https://desguaceselitaliano.com/",
    backendApiKey: "ecOEBsrAP3pr",
  },


  "https://desguacespeinador.com": {
    id: "cliente_011_premium",
    storeUrl: "https://desguacespeinador.com/",
    backendApiKey: "Vs8FwC32SFwP",
  },


  "https://chaparrejoehijos.com": {
    id: "cliente_012_premium",
    storeUrl: "https://chaparrejoehijos.com/",
    backendApiKey: "WiOcJqbTTsSu",
  },


  "https://desguacechaparrejo.es": {
    id: "cliente_013_premium",
    storeUrl: "https://desguacechaparrejo.es/",
    backendApiKey: "FIGOhPNaHahW",
  },


  "https://desguacecortes.es": {
    id: "cliente_014_premium",
    storeUrl: "https://desguacecortes.es/",
    backendApiKey: "c421DlW7OvvI",
  },


  "https://desguacesautorecicla.com": {
    id: "cliente_015_premium",
    storeUrl: "https://desguacesautorecicla.com/",
    backendApiKey: "vHUKtirW86SE",
  },


  "https://desguacesborox.com": {
    id: "cliente_016_premium",
    storeUrl: "https://www.desguacesborox.com/",
    backendApiKey: "vEcPJ3V4q9Bk",
  },


  "https://desguacesalvadorehijo.com": {
    id: "cliente_017_premium",
    storeUrl: "https://desguacesalvadorehijo.com/",
    backendApiKey: "yMExYuUrQ4GI",
  },


  "https://autodesguacesquiroga.com": {
    id: "cliente_018_premium",
    storeUrl: "https://autodesguacesquiroga.com/",
    backendApiKey: "GdIeGHs5A9pb",
  },


  // Entrada para desarrollo local: permite que el frontend en localhost conecte al backend
  // usando el catálogo real de producción para tener datos con los que probar.
  "http://localhost:5173": {
    id: "cliente_local_dev",
    storeUrl: "https://dev4premium.desguacesyrecambios.com",
    backendApiKey: "clave_local",
  },
};

const getClienteByOrigin = (origin) => {
  if (!origin) return null;
  // Quitamos la barra final para normalizar el origen.
  const originClean = origin.replace(/\/$/, "");
  // Match directo con la clave tal cual está registrada.
  if (CLIENTES[originClean]) return CLIENTES[originClean];
  // Si no coincide, probamos alternando el "www." para que dé igual
  // que la web cargue desde "dominio.com" o "www.dominio.com".
  const alternativo = /^https?:\/\/www\./i.test(originClean)
    ? originClean.replace(/^(https?:\/\/)www\./i, "$1")
    : originClean.replace(/^(https?:\/\/)/i, "$1www.");
  return CLIENTES[alternativo] || null;
};

module.exports = { getClienteByOrigin };
