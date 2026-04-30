const path = require("path");
const { performance } = require("perf_hooks");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { seleccionRespuestaPremium } = require("./services/aiService");
const apiRepository = require("./repositories/apiRepository");

async function superTest() {
  console.log("\n" + "=".repeat(80));
  console.log("📊  SISTEMA DE AUDITORÍA AVANZADA - AGENTE IA PREMIUM");
  console.log("=".repeat(80) + "\n");

  let mochilaContexto = ""; // Aquí vive la memoria del bot

  const bateriaPruebas = [
    {
      nombre: "FASE 1: Identificación de Pieza",
      mensaje: "Necesito una aleta delantera izquierda.",
      espera: "Debe extraer 'aleta delantera izquierda'",
    },
    {
      nombre: "FASE 2: Inyección de Marca/Modelo",
      mensaje: "Mi coche es un BMW Serie 3 del 2012.",
      espera: "Debe mantener la aleta y añadir BMW Serie 3 2012",
    },
    {
      nombre: "FASE 3: Corrección Dinámica",
      mensaje: "Perdón, me he equivocado de lado, ponme la derecha.",
      espera: "Debe cambiar 'izquierda' por 'derecha' manteniendo el coche",
    },
    {
      nombre: "FASE 4: Cambio Radical (Reset parcial)",
      mensaje: "Olvida el BMW, ahora búscame un alternador para un Audi A4.",
      espera: "Debe borrar todo lo anterior y buscar Alternador Audi A4",
    },
  ];

  for (const [index, prueba] of bateriaPruebas.entries()) {
    const idPrueba = `RUN-${index + 1}`;
    console.log(
      `\n[\x1b[35m${idPrueba}\x1b[0m] \x1b[1m${prueba.nombre}\x1b[0m`,
    );
    console.log(`👤 \x1b[32mUsuario:\x1b[0m "${prueba.mensaje}"`);

    const tInicioGlobal = performance.now();

    // --- LLAMADA A IA ---
    const tInicioIA = performance.now();
    const resIA = await seleccionRespuestaPremium(
      prueba.mensaje,
      mochilaContexto,
      idPrueba,
    );
    const tIA = performance.now() - tInicioIA;

    if (!resIA) {
      console.log("❌ ERROR: La IA no respondio (Fallo de red o API).");
      continue;
    }

    // --- LLAMADA A API (Simulada desde el test para desglose) ---
    let tAPI = 0;
    let numPiezas = 0;
    let queryGenerada = "NADA (IA no genero intent)";

    if (resIA.nuevoContexto) {
      mochilaContexto = resIA.nuevoContexto; // Actualizamos memoria
      const busqueda = JSON.parse(resIA.nuevoContexto);
      const query = Object.values(busqueda)
        .filter((v) => v && v !== "null")
        .join(" ");

      if (query.trim().length > 0) {
        queryGenerada = query;
        const tInicioAPI = performance.now();
        const resAPI = await apiRepository.consultarAPI({ q: query }, idPrueba);
        tAPI = performance.now() - tInicioAPI;
        numPiezas = resAPI.total || (resAPI.piezas ? resAPI.piezas.length : 0);
      }
    }

    const tTotal = performance.now() - tInicioGlobal;

    // --- PANEL DE RESULTADOS ---
    console.log(`\n   ⏱️  \x1b[1mTIEMPOS:\x1b[0m`);
    console.log(`      🧠 IA:  \x1b[33m${tIA.toFixed(0)}ms\x1b[0m`);
    console.log(`      🔌 API: \x1b[33m${tAPI.toFixed(0)}ms\x1b[0m`);
    console.log(`      🏁 TOTAL: \x1b[32m${tTotal.toFixed(0)}ms\x1b[0m`);

    console.log(`\n   🧠 \x1b[1mESTADO DE LA MEMORIA (MOCHILA):\x1b[0m`);
    const ctx = JSON.parse(mochilaContexto || "{}");
    console.log(`      📍 Pieza:  \x1b[36m${ctx.articulo || "---"}\x1b[0m`);
    console.log(
      `      🚗 Coche:  \x1b[36m${ctx.marca || "---"} ${ctx.modelo || "---"} (${ctx.ano || "---"})\x1b[0m`,
    );

    console.log(`\n   💬 \x1b[1mRESPUESTA AL CLIENTE:\x1b[0m`);
    console.log(`      "${resIA.respuesta}"`);

    console.log(`\n   📦 \x1b[1mRESULTADO DB:\x1b[0m`);
    console.log(`      🔍 Query: "${queryGenerada}"`);
    console.log(
      `      📊 Stock: ${numPiezas > 0 ? `✅ \x1b[32m${numPiezas} piezas\x1b[0m` : "❌ \x1b[31m0 resultados\x1b[0m"}`,
    );

    console.log(`\n${"-".repeat(80)}`);
  }

  console.log("\n✅ AUDITORIA FINALIZADA");
}

superTest().catch((err) => console.error("Fallo critico en el test:", err));
