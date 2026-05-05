const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { seleccionRespuestaPremium } = require("./services/aiService");

/**
 * AUDITORÍA DE NLU - TEST DE TRAMPAS TRANSACCIONALES Y TYPOS (20 CASOS)
 */
async function runNLUTest() {
  console.log("\n" + "=".repeat(80));
  console.log("🚀 EJECUTANDO AUDITORÍA NLU ESTRICTA (20 CASOS)");
  console.log("=".repeat(80) + "\n");

  const bateriaPruebas = [
    // --- BLOQUE 1: Verbo + Typo intentando llenar el Modelo ---
    {
      nombre: "M.1 Verbo + Modelo (Leon)",
      contextoPrevio: { articulo: "paragolpes", marca: "Seat" },
      mensaje: "necesito un leon",
      esperado: { articulo: "paragolpes", marca: "Seat", modelo: "leon" },
    },
    {
      nombre: "M.2 Verbo + Typo Modelo (A4)",
      contextoPrevio: { articulo: "faro", marca: "Audi" },
      mensaje: "busco ua4",
      esperado: { articulo: "faro", marca: "Audi", modelo: "a4" },
    },
    {
      nombre: "M.3 Verbo + Typo Modelo (Serie 3)",
      contextoPrevio: { articulo: "motor", marca: "BMW" },
      mensaje: "tienes para un sserie 3",
      esperado: { articulo: "motor", marca: "BMW", modelo: "serie 3" },
    },
    {
      nombre: "M.4 Verbo + Determinante Modelo (Focus)",
      contextoPrevio: { articulo: "puerta", marca: "Ford" },
      mensaje: "quiero pal focus",
      esperado: { articulo: "puerta", marca: "Ford", modelo: "focus" },
    },

    // --- BLOQUE 2: Verbo + Typo intentando llenar la Marca ---
    {
      nombre: "MA.1 Verbo + Typo Marca (Mercedes)",
      contextoPrevio: { articulo: "alternador" },
      mensaje: "busco de un mercedess",
      esperado: { articulo: "alternador", marca: "mercedes" },
    },
    {
      nombre: "MA.2 Verbo + Typo Marca (Renault)",
      contextoPrevio: { articulo: "caja cambios" },
      mensaje: "necesito para renol",
      esperado: { articulo: "caja cambios", marca: "renault" },
    },
    {
      nombre: "MA.3 Verbo + Typo Marca (Peugeot)",
      contextoPrevio: { articulo: "asiento" },
      mensaje: "tienes de pegot",
      esperado: { articulo: "asiento", marca: "peugeot" },
    },
    {
      nombre: "MA.4 Verbo + Typo Marca (BMW)",
      contextoPrevio: { articulo: "espejo" },
      mensaje: "quiero pa un bmv",
      esperado: { articulo: "espejo", marca: "bmw" },
    },

    // --- BLOQUE 3: Verbo intentando llenar la Versión/Año ---
    {
      nombre: "VA.1 Verbo + Versión (TDI)",
      contextoPrevio: { articulo: "turbo", marca: "VW", modelo: "Golf" },
      mensaje: "busco el tdi",
      esperado: {
        articulo: "turbo",
        marca: "VW",
        modelo: "Golf",
        version: "tdi",
      },
    },
    {
      nombre: "VA.2 Verbo + Año (2005)",
      contextoPrevio: { articulo: "bomba", marca: "Opel", modelo: "Astra" },
      mensaje: "necesito del 2005",
      esperado: {
        articulo: "bomba",
        marca: "Opel",
        modelo: "Astra",
        ano: "2005",
      },
    },
    {
      nombre: "VA.3 Verbo + Versión (VTS)",
      contextoPrevio: { articulo: "capo", marca: "Citroen", modelo: "C4" },
      mensaje: "tienes pal vts",
      esperado: {
        articulo: "capo",
        marca: "Citroen",
        modelo: "C4",
        version: "vts",
      },
    },
    {
      nombre: "VA.4 Verbo + Año (2012)",
      contextoPrevio: { articulo: "radiador", marca: "Fiat", modelo: "Punto" },
      mensaje: "busco del 2012",
      esperado: {
        articulo: "radiador",
        marca: "Fiat",
        modelo: "Punto",
        ano: "2012",
      },
    },

    // --- BLOQUE 4: Falsos amigos (Cambio real de pieza con verbo) ---
    {
      nombre: "F.1 Cambio Pieza Directo",
      contextoPrevio: { articulo: "faro", marca: "Audi", modelo: "A3" },
      mensaje: "mejor buscame el motor",
      esperado: { articulo: "motor", marca: "Audi", modelo: "A3" },
    },
    {
      nombre: "F.2 Olvida Pieza Anterior",
      contextoPrevio: { articulo: "puerta", marca: "Ford" },
      mensaje: "olvida la puerta, necesito el capo",
      esperado: { articulo: "capo", marca: "Ford" },
    },
    {
      nombre: "F.3 Cambio Pieza Radical",
      contextoPrevio: { articulo: "asiento" },
      mensaje: "ya no quiero el asiento, busco un volante",
      esperado: { articulo: "volante" },
    },
    {
      nombre: "F.4 Sustitución con Verbo",
      contextoPrevio: { articulo: "alternador", marca: "Renault" },
      mensaje: "no busques mas eso, necesito una bateria",
      esperado: { articulo: "bateria", marca: "Renault" },
    },

    // --- BLOQUE 5: Verbo + Pieza real con faltas graves ---
    {
      nombre: "P.1 Typo Grave Pieza",
      contextoPrevio: { marca: "Seat" },
      mensaje: "nesesito arternador",
      esperado: { articulo: "alternador", marca: "Seat" },
    },
    {
      nombre: "P.2 Typo Grave Pieza",
      contextoPrevio: { marca: "BMW" },
      mensaje: "busco paragolpe trsero",
      esperado: { articulo: "paragolpes trasero", marca: "BMW" },
    },
    {
      nombre: "P.3 Typo Grave Pieza",
      contextoPrevio: { marca: "Audi" },
      mensaje: "quiero un compresó de aire",
      esperado: { articulo: "compresor aire", marca: "Audi" },
    },
    {
      nombre: "P.4 Typo Grave Pieza",
      contextoPrevio: { marca: "Ford" },
      mensaje: "tienes un aleta delantera decha",
      esperado: { articulo: "aleta delantera derecha", marca: "Ford" },
    },
  ];

  let resultados = [];
  let exitos = 0;
  let fallos = 0;

  for (const [index, prueba] of bateriaPruebas.entries()) {
    const idPrueba = `NLU-${String(index + 1).padStart(2, "0")}`;
    console.log(
      `[${index + 1}/20] Ejecutando ${idPrueba}: ${prueba.nombre}...`,
    );

    const mochilaContexto = JSON.stringify(prueba.contextoPrevio || {});

    try {
      const resIA = await seleccionRespuestaPremium(
        prueba.mensaje,
        mochilaContexto,
        idPrueba,
      );

      const ctxFinal = JSON.parse(resIA.nuevoContexto || "{}");

      let errores = [];
      const normalize = (v) => {
        if (v === null || v === undefined || v === "null" || v === "")
          return null;
        // Normalizamos quitando tildes y espacios extra para evitar fallos tontos
        return String(v)
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
      };

      // VERIFICACIÓN ESTRICTA: Comparamos cada llave clave esperada con la real
      for (const llave in prueba.esperado) {
        const normReal = normalize(ctxFinal[llave]);
        const normExp = normalize(prueba.esperado[llave]);

        if (normReal !== normExp) {
          // Ya NO usamos 'includes' para no camuflar errores como "ua4".
          // Se requiere coincidencia exacta o fallo.
          errores.push(
            `Fallo en [${llave}]: Esperaba '${normExp}', IA devolvió '${normReal}'`,
          );
        }
      }

      // Verificamos que la IA no haya ensuciado campos que deberían estar vacíos
      const camposBase = [
        "articulo",
        "marca",
        "modelo",
        "ano",
        "version",
        "referencia",
      ];
      for (const llave of camposBase) {
        if (!prueba.esperado[llave] && normalize(ctxFinal[llave])) {
          errores.push(
            `Fallo por Inserción: IA metió '${ctxFinal[llave]}' en [${llave}] sin permiso`,
          );
        }
      }

      const pasoPrueba = errores.length === 0;
      if (pasoPrueba) exitos++;
      else fallos++;

      const formatObj = (obj) => {
        return (
          Object.keys(obj)
            .filter(
              (k) => obj[k] !== null && obj[k] !== undefined && obj[k] !== "",
            )
            .map((k) => `${k}: ${obj[k]}`)
            .join(" | ") || "Vacío"
        );
      };

      resultados.push({
        n: String(index + 1),
        prueba: prueba.nombre,
        entrada: `"${prueba.mensaje}"`,
        esperado: formatObj(prueba.esperado),
        aportado: formatObj(ctxFinal),
        erroresInfo: errores.join(" / "),
        exito: pasoPrueba ? "✅ SÍ" : "❌ NO",
      });
    } catch (err) {
      fallos++;
      resultados.push({
        n: String(index + 1),
        prueba: prueba.nombre,
        entrada: `"${prueba.mensaje}"`,
        esperado: "---",
        aportado: `ERROR: ${err.message}`,
        erroresInfo: "Fallo de ejecución",
        exito: "❌ ERR",
      });
    }
  }

  // Lógica de alineación para la tabla Markdown
  const colWidths = {
    n: Math.max(2, ...resultados.map((r) => r.n.length)),
    prueba: Math.max(10, ...resultados.map((r) => r.prueba.length)),
    entrada: Math.max(15, ...resultados.map((r) => r.entrada.length)),
    aportado: Math.max(15, ...resultados.map((r) => r.aportado.length)),
    exito: 6,
  };

  const pad = (str, width) => str + " ".repeat(Math.max(0, width - str.length));

  let tablaPro = [];
  const header = `| ${pad("#", colWidths.n)} | ${pad("Prueba", colWidths.prueba)} | ${pad("Entrada (Usuario)", colWidths.entrada)} | ${pad("Resultado Real de la IA", colWidths.aportado)} | ${pad("Éxito", colWidths.exito)} |`;
  const separator = `| ${"-".repeat(colWidths.n)} | ${"-".repeat(colWidths.prueba)} | ${"-".repeat(colWidths.entrada)} | ${"-".repeat(colWidths.aportado)} | ${"-".repeat(colWidths.exito)} |`;

  tablaPro.push(header);
  tablaPro.push(separator);

  resultados.forEach((r) => {
    tablaPro.push(
      `| ${pad(r.n, colWidths.n)} | ${pad(r.prueba, colWidths.prueba)} | ${pad(r.entrada, colWidths.entrada)} | ${pad(r.aportado, colWidths.aportado)} | ${pad(r.exito, colWidths.exito)} |`,
    );
    // Si falla, imprimimos el detalle exacto del error debajo para que lo leas fácilmente
    if (r.exito !== "✅ SÍ") {
      tablaPro.push(`> ⚠️ ERROR: ${r.erroresInfo}\n`);
    }
  });

  const contenidoFinal =
    "# INFORME DE AUDITORÍA NLU - TRAMPAS TRANSACCIONALES\n\n" +
    "Fecha: " +
    new Date().toLocaleString() +
    "\n" +
    `Resumen: ✅ ${exitos} | ❌ ${fallos} | Total: ${bateriaPruebas.length}\n\n` +
    tablaPro.join("\n") +
    "\n";

  fs.writeFileSync(
    path.resolve(__dirname, "../informacion.txt"),
    contenidoFinal,
  );

  console.log("\n" + "=".repeat(80));
  console.log(`✨ AUDITORÍA FINALIZADA. Éxitos: ${exitos}, Fallos: ${fallos}`);
  console.log(
    "Abre el archivo informacion.txt para ver exactamente dónde y por qué ha fallado la IA.",
  );
  console.log("=".repeat(80) + "\n");
}

runNLUTest().catch((err) => {
  console.error("Fallo catastrófico:", err);
  process.exit(1);
});
