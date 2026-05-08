// src/config/clientes.js
const CLIENTES = {
  //AQUI SE PONE LA URL DESDE DONDE VAN A EJECUTAR EL BOT    
  "https://dev4premium.desguacesyrecambios.com": {
    id: "cliente_001_premium",
    storeUrl: "https://dev4premium.desguacesyrecambios.com", // Estrategia A
    apiUrl:
      "https://dev4premium.desguacesyrecambios.com/desguacesv8/api/recambios/piezas/", // Estrategia B
    //CONTRASEÑA QUE TIENE QUE COINCIDIR CON LA API_KEY DEL WP
    backendApiKey: "12345",
  },

  "http://localhost:5173": {
    id: "cliente_local_dev",
    storeUrl: "https://dev4premium.desguacesyrecambios.com", // Usamos la tienda real para que haya piezas
    backendApiKey: "clave_local",
  },
};

const getClienteByOrigin = (origin) => {
  if (!origin) return null;
  const originClean = origin.replace(/\/$/, "");
  return CLIENTES[originClean] || null;
};

module.exports = { getClienteByOrigin };
