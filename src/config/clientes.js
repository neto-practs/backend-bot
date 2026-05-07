// src/config/clientes.js
const CLIENTES = {
  "https://mi-web-de-prueba.com": {
    id: "cliente_001_premium",
    storeUrl: "https://dev4premium.desguacesyrecambios.com", // Estrategia A
    apiUrl:
      "https://dev4premium.desguacesyrecambios.com/desguacesv8/api/recambios/piezas/", // Estrategia B
    backendApiKey: "12345",
  },

 
};

const getClienteByOrigin = (origin) => {
  if (!origin) return null;
  const originClean = origin.replace(/\/$/, "");
  return CLIENTES[originClean] || null;
};

module.exports = { getClienteByOrigin };
