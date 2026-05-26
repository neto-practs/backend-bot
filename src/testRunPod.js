// testFinal.js
const API_URL = "http://localhost:4000/api/chat";
const API_KEY = "clave_local";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const RESET = "\x1b[0m";

const casosDePrueba = [
  // --- BÚSQUEDAS COMPLETAS O CORRECTAS (1-5) ---
  { input: "busco un faro delantero para un seat ibiza del 2015", tipo: "exito" },
  { input: "necesito espejo retrovisor izquierdo para audi a4", tipo: "exito" },
  { input: "bomba de agua renault megane", tipo: "exito" },
  { input: "tienes pinza de freno ford focus", tipo: "exito" },
  { input: "alternador opel astra", tipo: "exito" },

  // --- PRUEBAS DE SUGERENCIAS (NUEVO) ---
  { input: "no sé que modelo es mi coche", tipo: "sugerencia", esperado: true, nota: "Usuario bloqueado" },
  { input: "ayuda no se seguir", tipo: "sugerencia", esperado: true, nota: "Usuario pide ayuda" },
  { input: "que modelos hay disponibles", tipo: "sugerencia", esperado: true, nota: "Petición de listado" },
  { input: "busco un motor de arranque", tipo: "sugerencia", esperado: false, nota: "Búsqueda normal (NO sugerencias)" },
  { input: "es un audi a3", tipo: "sugerencia", esperado: false, nota: "Dato directo (NO sugerencias)" },

  // --- AUTOCORRECCIÓN LEVE DE ARTÍCULOS ---
  { input: "hola, necesito un alternaddor", tipo: "exito", verificar: { campo: "articulo", esperado: "alternador" } },
  { input: "busco farro derecho para un seat marvella", tipo: "exito", verificar: { campo: "articulo", esperado: "faro derecho" } },
  { input: "tienes parachoques delanto", tipo: "exito", verificar: { campo: "articulo", esperado: "paragolpes delantero" } },

  // --- BLOQUEOS CONTROLADOS: ARTÍCULO ERRÓNEO O INVENTADO ---
  { input: "necesito un condensador de fluzo para mi dmc", tipo: "bloqueo_articulo" },
  { input: "tienes un perrito piloto de repuesto", tipo: "bloqueo_articulo" },

  // --- BLOQUEOS CONTROLADOS: MARCA ERRÓNEA O INVENTADO ---
  { input: "faro izquierdo de jksdfhkjs clio", tipo: "bloqueo_marca" },
  { input: "motor para un coche marca mcdonalds", tipo: "bloqueo_marca" }
];

async function enviarMensaje(texto, sessionId) {
  try {
    const respuesta = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": API_KEY,
        "Origin": "http://localhost:5173"
      },
      body: JSON.stringify({ 
        message: texto,
        contexto: "{}",
        reqId: sessionId
      })
    });

    if (!respuesta.ok) {
      const errorText = await respuesta.text();
      throw new Error(`Error HTTP: ${respuesta.status} - ${errorText}`);
    }

    return await respuesta.json();
  } catch (error) {
    return { error: error.message };
  }
}

async function ejecutarMegaSuite() {
  console.log(`${CYAN}======================================================================${RESET}`);
  console.log(`${CYAN}🚀 INICIANDO SUITE DE PRUEBAS: FOCO EN SUGERENCIAS E INTELIGENCIA${RESET}`);
  console.log(`${CYAN}======================================================================\n${RESET}`);

  let pasados = 0;
  let fallados = 0;

  for (let i = 0; i < casosDePrueba.length; i++) {
    const caso = casosDePrueba[i];
    const sessionId = `suite_session_${Date.now()}_${i}`;
    
    console.log(`${YELLOW}[Caso ${i + 1}/${casosDePrueba.length}]${RESET} "${caso.input}" ${caso.nota ? `(${caso.nota})` : ""}`);
    process.stdout.write(`⏳ Analizando... `);

    const respuestaBot = await enviarMensaje(caso.input, sessionId);

    if (respuestaBot.error) {
      console.log(`\n${RED}❌ ERROR DE CONEXIÓN (¿Está el servidor encendido?):${RESET} ${respuestaBot.error}`);
      return;
    }

    const textoBot = (respuestaBot.respuesta || "").toLowerCase();
    const tieneSugerencias = respuestaBot.sugerencias && respuestaBot.sugerencias.length > 0;
    let pasoElTest = false;
    let detalleVerificacion = "";

    if (caso.tipo === "exito") {
      pasoElTest = !textoBot.includes("no reconozco la marca") && !textoBot.includes("no estoy seguro a que pieza");
      if (pasoElTest && caso.verificar) {
        const contextoMemoria = JSON.parse(respuestaBot.nuevoContexto || "{}");
        const valorExtraido = (contextoMemoria[caso.verificar.campo] || "").toLowerCase();
        if (!valorExtraido.includes(caso.verificar.esperado.toLowerCase())) {
          pasoElTest = false;
          detalleVerificacion = ` -> [Fallo extracción. Esperaba: "${caso.verificar.esperado}", Encontró: "${valorExtraido}"]`;
        }
      }
    } else if (caso.tipo === "sugerencia") {
      if (tieneSugerencias === caso.esperado) {
        pasoElTest = true;
      } else {
        detalleVerificacion = ` -> [Sugerencias: ${tieneSugerencias}. Se esperaba: ${caso.esperado}]`;
      }
    } else if (caso.tipo === "bloqueo_articulo") {
      pasoElTest = textoBot.includes("no estoy seguro a que pieza") || textoBot.includes("no estoy seguro a qué pieza");
    } else if (caso.tipo === "bloqueo_marca") {
      pasoElTest = textoBot.includes("no reconozco la marca");
    }

    if (pasoElTest) {
      console.log(`${GREEN}✅ PASADO${RESET}${detalleVerificacion}`);
      pasados++;
    } else {
      console.log(`${RED}❌ FALLADO${RESET}${detalleVerificacion}`);
      console.log(`   🤖 Respuesta Bot: "${respuestaBot.respuesta}"`);
      console.log(`   🧠 Sugerencias Recibidas: ${respuestaBot.sugerencias ? respuestaBot.sugerencias.length : 0} items`);
      fallados++;
    }
  }

  const porcentajeEfectividad = ((pasados / casosDePrueba.length) * 100).toFixed(2);

  console.log(`\n${CYAN}======================================================================${RESET}`);
  console.log(`📊 REPORTE DE CALIDAD FINAL`);
  console.log(`${CYAN}======================================================================${RESET}`);
  console.log(`${GREEN}✅ Pruebas Superadas: ${pasados} / ${casosDePrueba.length}${RESET}`);
  console.log(`${RED}❌ Pruebas Falladas: ${fallados} / ${casosDePrueba.length}${RESET}`);
  console.log(`${MAGENTA}📈 Índice de Efectividad: ${porcentajeEfectividad}%${RESET}`);
  console.log(`${CYAN}======================================================================\n${RESET}`);
}

ejecutarMegaSuite();
