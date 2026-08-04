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
//
// 4. isV7 (opcional): poner a true SOLO para webs antiguas cuya API vive bajo /desguacesv7/
//    en lugar de /desguacesv8/. La respuesta JSON es idéntica; solo cambia la ruta.
//    Si se omite, el cliente se trata como v8 (nuevo) por defecto.

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


  "https://desguacesautoeco.es": {
    id: "cliente_019_premium",
    storeUrl: "https://desguacesautoeco.es/",
    backendApiKey: "GzZfP0ZlTeIP",
  },


  "https://desguacepellicer.com": {
    id: "cliente_020_premium",
    storeUrl: "https://desguacepellicer.com/",
    backendApiKey: "2MLFZKavqUJi",
  },


  "https://desguacescanal.com": {
    id: "cliente_021_premium",
    storeUrl: "https://desguacescanal.com/",
    backendApiKey: "ep6vJgtjIYVN",
  },


  "https://ecoglobalexpress.com": {
    id: "cliente_022_premium",
    storeUrl: "https://ecoglobalexpress.com/",
    backendApiKey: "bgwCq1y3FaDu",
  },


  "https://desguacesdelbages.cat": {
    id: "cliente_023_premium",
    storeUrl: "https://desguacesdelbages.cat/",
    backendApiKey: "GoPG42gMYo4n",
  },


  "https://encuentratuspiezas.es": {
    id: "cliente_024_premium",
    storeUrl: "https://encuentratuspiezas.es/",
    backendApiKey: "LAwDhpJvnSVf",
  },

  "https://autodesguaceaviles.com": {
    id: "cliente_025_premium",
    storeUrl: "https://autodesguaceaviles.com/",
    backendApiKey: "azlVers12",
  },

  "https://autodesguacesdeblas.com": {
    id: "cliente_026_premium",
    storeUrl: "https://autodesguacesdeblas.com/",
    backendApiKey: "azlVers12",
  },

  "https://desguacenaldo.es": {
    id: "cliente_027_premium",
    storeUrl: "https://desguacenaldo.es/",
    backendApiKey: "azlVers12",
  },

  "https://ecorepuesto.com": {
    id: "cliente_028_premium",
    storeUrl: "https://ecorepuesto.com/",
    backendApiKey: "azlVers12",
  },

  "https://resoex.es": {
    id: "cliente_029_premium",
    storeUrl: "https://resoex.es/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://autodesguacescastro.com": {
    id: "cliente_030_premium",
    storeUrl: "https://autodesguacescastro.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacesromero.com": {
    id: "cliente_031_premium",
    storeUrl: "https://desguacesromero.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacegomez.com": {
    id: "cliente_032_premium",
    storeUrl: "https://desguacegomez.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacesguarena.com": {
    id: "cliente_033_premium",
    storeUrl: "https://desguacesguarena.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://arteodesguaces.com": {
    id: "cliente_034_premium",
    storeUrl: "https://arteodesguaces.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://elcheautodesguaces.com": {
    id: "cliente_035_premium",
    storeUrl: "https://elcheautodesguaces.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://recambiosmacor.com": {
    id: "cliente_036_premium",
    storeUrl: "https://recambiosmacor.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguaceselpollo.com": {
    id: "cliente_037_premium",
    storeUrl: "https://desguaceselpollo.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacevibelcar.com": {
    id: "cliente_038_premium",
    storeUrl: "https://desguacevibelcar.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacebaena.es": {
    id: "cliente_039_premium",
    storeUrl: "https://desguacebaena.es/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacejtorres.com": {
    id: "cliente_040_premium",
    storeUrl: "https://desguacejtorres.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://autodesguaceelvalle.com": {
    id: "cliente_041_premium",
    storeUrl: "https://autodesguaceelvalle.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacescastro.com": {
    id: "cliente_042_premium",
    storeUrl: "https://desguacescastro.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://autodes.es": {
    id: "cliente_043_premium",
    storeUrl: "https://autodes.es/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacemesa.es": {
    id: "cliente_044_premium",
    storeUrl: "https://desguacemesa.es/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacespetelos.com": {
    id: "cliente_045_premium",
    storeUrl: "https://desguacespetelos.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacesquini.com": {
    id: "cliente_046_premium",
    storeUrl: "https://desguacesquini.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacesmackintosh.com": {
    id: "cliente_047_premium",
    storeUrl: "https://desguacesmackintosh.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://autodesguacecastellar.com": {
    id: "cliente_048_premium",
    storeUrl: "https://autodesguacecastellar.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacesvegamedia.com": {
    id: "cliente_049_premium",
    storeUrl: "https://desguacesvegamedia.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://recicauto.com": {
    id: "cliente_050_premium",
    storeUrl: "https://recicauto.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://recambiosreciclados.es": {
    id: "cliente_051_premium",
    storeUrl: "https://recambiosreciclados.es/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguacemanolo.es": {
    id: "cliente_052_premium",
    storeUrl: "https://desguacemanolo.es/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://repuestos-seo.com": {
    id: "cliente_053_premium",
    storeUrl: "https://repuestos-seo.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://aprovechauto.com": {
    id: "cliente_054_premium",
    storeUrl: "https://aprovechauto.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://resomaex.com": {
    id: "cliente_055_premium",
    storeUrl: "https://resomaex.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://modelauto.es": {
    id: "cliente_056_premium",
    storeUrl: "https://modelauto.es/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://carcenter.cat": {
    id: "cliente_057_premium",
    storeUrl: "https://carcenter.cat/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  "https://desguaces-stop.com": {
    id: "cliente_058_premium",
    storeUrl: "https://desguaces-stop.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

    "https://recuperacionescumplido.com": {
    id: "cliente_059_premium",
    storeUrl: "https://recuperacionescumplido.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

    "https://autodesguacelacarcel.com": {
    id: "cliente_060_premium",
    storeUrl: "https://autodesguacelacarcel.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

    "https://autoreco.es": {
    id: "cliente_061_premium",
    storeUrl: "https://autoreco.es/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

    "https://reciclajesinorganicoscarmona.com": {
    id: "cliente_062_premium",
    storeUrl: "https://reciclajesinorganicoscarmona.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

    "https://desguacesmackintoshnaquera.com": {
    id: "cliente_063_premium",
    storeUrl: "https://desguacesmackintoshnaquera.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

    "https://desguacestito.es": {
    id: "cliente_064_premium",
    storeUrl: "https://desguacestito.es/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

    "https://desguacevendrell.com": {
    id: "cliente_065_premium",
    storeUrl: "https://desguacevendrell.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

    "https://tucochesiniestrado.com": {
    id: "cliente_066_premium",
    storeUrl: "https://tucochesiniestrado.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

    "https://desguacesdli.com": {
    id: "cliente_067_premium",
    storeUrl: "https://desguacesdli.com/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

    "https://youauto.es": {
    id: "cliente_068_premium",
    storeUrl: "https://youauto.es/",
    backendApiKey: "desv7a5562",
    isV7: true, // Web antigua: API bajo /desguacesv7/
  },

  // Entrada para desarrollo local: permite que el frontend en localhost conecte al backend
  // usando el catálogo real de producción para tener datos con los que probar.
  "http://localhost:5173": {
    id: "cliente_local_dev",
    storeUrl: "https://dev4premium.desguacesyrecambios.com",
    backendApiKey: "clave_local",
  },
};

// Normaliza un origen (o una clave de CLIENTES) a "host[:puerto][/path]" quitando:
//   - el protocolo (http:// o https://)  → match indiferente a http/https
//   - el "www." inicial                  → da igual "dominio.com" que "www.dominio.com"
//   - la barra final
// Así el navegador puede cargar el chat desde cualquier variante y seguir casando.
const normalizarOrigen = (valor) =>
  String(valor)
    .trim()
    .toLowerCase()
    .replace(/\/$/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");

// Índice de clientes por origen normalizado, construido una sola vez al cargar el módulo.
const CLIENTES_NORMALIZADOS = Object.entries(CLIENTES).reduce((acc, [clave, cliente]) => {
  acc[normalizarOrigen(clave)] = cliente;
  return acc;
}, {});

const getClienteByOrigin = (origin) => {
  if (!origin) return null;
  return CLIENTES_NORMALIZADOS[normalizarOrigen(origin)] || null;
};

module.exports = { getClienteByOrigin };
