const { validarYCorregir } = require("./src/utils/correctorOrtografico");

const testCases = [
  // --- SWAPS (Palabras en campos equivocados) ---
  { name: "Marca en modelo", ctx: { articulo: "faro", marca: null, modelo: "Audi" } },
  { name: "Articulo en marca", ctx: { articulo: null, marca: "alternador", modelo: "Golf" } },
  { name: "Modelo en articulo", ctx: { articulo: "Ibiza", marca: "Seat", modelo: null } },
  { name: "Todo al reves", ctx: { articulo: "Toyota", marca: "Corolla", modelo: "paragolpes" } },

  // --- CORRECCIONES ARTICULOS (Leves) ---
  { name: "Articulo typo 1", ctx: { articulo: "altrenador", marca: "BMW", modelo: "Serie 3" } },
  { name: "Articulo typo 2", ctx: { articulo: "paragolpess", marca: "Audi", modelo: "A4" } },
  { name: "Articulo typo 3", ctx: { articulo: "intermitentez", marca: "Ford", modelo: "Focus" } },
  { name: "Articulo typo 4", ctx: { articulo: "radiadro", marca: "Renault", modelo: "Megane" } },
  { name: "Articulo typo 5", ctx: { articulo: "compresor aire", marca: "Opel", modelo: "Astra" } },

  // --- CORRECCIONES MARCAS (Leves) ---
  { name: "Marca typo 1", ctx: { articulo: "motor", marca: "Volksvagen", modelo: "Golf" } },
  { name: "Marca typo 2", ctx: { articulo: "espejo", marca: "Citroen", modelo: "C3" } },
  { name: "Marca typo 3", ctx: { articulo: "freno", marca: "Peugot", modelo: "208" } },
  { name: "Marca typo 4", ctx: { articulo: "puerta", marca: "Mercedez", modelo: "Clase C" } },
  { name: "Marca typo 5", ctx: { articulo: "faro", marca: "Hyndai", modelo: "I30" } },

  // --- MODELOS (Protección: No corrección) ---
  { name: "Modelo raro 1", ctx: { articulo: "asiento", marca: "Seat", modelo: "Leonn" } },
  { name: "Modelo raro 2", ctx: { articulo: "capo", marca: "Audi", modelo: "A3 Sportbackk" } },
  { name: "Modelo raro 3", ctx: { articulo: "pomo", marca: "BMW", modelo: "M3 E466" } },
  { name: "Modelo raro 4", ctx: { articulo: "llanta", marca: "Ford", modelo: "Fiestaaa" } },
  { name: "Modelo raro 5", ctx: { articulo: "manguito", marca: "Fiat", modelo: "500 Ccc" } },

  // --- ERRORES GRAVES (Debe pedir reescribir) ---
  { name: "Basura pura", ctx: { articulo: "xyzabc123", marca: "Audi", modelo: "A4" } },
  { name: "Articulo irreconocible", ctx: { articulo: "cositadelcoche", marca: "Seat", modelo: "Ibiza" } },
  { name: "Marca inexistente", ctx: { articulo: "faro", marca: "MarcaFalsa", modelo: "Modelo" } },
  { name: "Palabra cortada", ctx: { articulo: "alt", marca: "BMW", modelo: "X5" } },

  // --- MIXTOS Y COMPLEJOS ---
  { name: "Multiples palabras articulo", ctx: { articulo: "puerta delantera izquierda", marca: "Audi", modelo: "A6" } },
  { name: "Marca y modelo pegados", ctx: { articulo: "alternador", marca: "Bmw Serie1", modelo: null } },
  { name: "Articulo con marca incluida", ctx: { articulo: "Faro Seat", marca: null, modelo: "Ibiza" } },
  { name: "Acentos y simbolos", ctx: { articulo: "CIGÜEÑAL", marca: "PEUGEOT", modelo: "308" } },
  { name: "Minúsculas extremas", ctx: { articulo: "piloto", marca: "toyota", modelo: "hilux" } },
  { name: "Mayúsculas extremas", ctx: { articulo: "MOTOR ARRANQUE", marca: "NISSAN", modelo: "QASHQAI" } },
  { name: "Espacios extra", ctx: { articulo: "  faro  ", marca: "  Audi  ", modelo: "  A3  " } }
];

console.log(`EJECUTANDO ${testCases.length} PRUEBAS DE VALIDACIÓN Y CORRECCIÓN\n`);

let exitos = 0;
let errores = 0;

testCases.forEach((test, index) => {
  const result = validarYCorregir(test.ctx);
  console.log(`[${index + 1}/30] Test: ${test.name}`);
  
  if (result.error) {
    console.log(`   ❌ BLOQUEADO: ${result.mensaje}`);
    errores++;
  } else {
    console.log(`   ✅ OK: ${JSON.stringify(result.contextoCorregido)}`);
    exitos++;
  }
});

console.log(`\nRESUMEN: ${exitos} Aceptados | ${errores} Bloqueados.`);
