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

  // --- AUTOCORRECCIÓN LEVE DE ARTÍCULOS (6-15) ---
  { input: "hola, necesito un alternaddor", tipo: "exito", verificar: { campo: "articulo", esperado: "alternador" } },
  { input: "busco farro derecho para un seat marvella", tipo: "exito", verificar: { campo: "articulo", esperado: "faro derecho" } },
  { input: "tienes parachoques delanto", tipo: "exito", verificar: { campo: "articulo", esperado: "paragolpes delantero" } },
  { input: "necesito una balbula de escape", tipo: "exito", verificar: { campo: "articulo", esperado: "valvula escape" } },
  { input: "kit de embrage para peugeot", tipo: "exito", verificar: { campo: "articulo", esperado: "kit embrague" } },
  { input: "compresor de aire acondisando", tipo: "exito" },
  { input: "pastilas de freno traseras", tipo: "exito" },
  { input: "motor de arenque para coche", tipo: "exito" },
  { input: "radiador de calefasion", tipo: "exito" },
  { input: "bomba inyeccion diesel", tipo: "exito" },

  // --- AUTOCORRECCIÓN LEVE DE MARCAS (16-25) ---
  { input: "faro delantero para un seatt ibiza", tipo: "exito", verificar: { campo: "marca", esperado: "seat" } },
  { input: "motor completo para un wolkswagen golf", tipo: "exito", verificar: { campo: "marca", esperado: "volkswagen" } },
  { input: "espejo derecho de renaut clio", tipo: "exito", verificar: { campo: "marca", esperado: "renault" } },
  { input: "alternador para poyot 208", tipo: "exito", verificar: { campo: "marca", esperado: "peugeot" } },
  { input: "paragolpes de un ford focus", tipo: "exito", verificar: { campo: "marca", esperado: "ford" } },
  { input: "aleta izquierda de sitroen c3", tipo: "exito" },
  { input: "piloto trasero para vmw e46", tipo: "exito" },
  { input: "bomba freno de mersedes c220", tipo: "exito" },
  { input: "inyector para hunday i30", tipo: "exito" },
  { input: "manguito para niisand qashqai", tipo: "exito" },

  // --- CASOS DONDE EL MODELO DEBE PASAR LIBRE (26-30) ---
  { input: "faro para seat ibisa", tipo: "exito", nota: "modelo con falta ortografica pasa libre" },
  { input: "paragolpes para ford batmovil", tipo: "exito", nota: "modelo inventado pasa libre" },
  { input: "espejo retrovisor de opel asstra", tipo: "exito" },
  { input: "motor de renault meganne", tipo: "exito" },
  { input: "alternador para audi a 4", tipo: "exito" },

  // --- BLOQUEOS CONTROLADOS: ARTÍCULO ERRÓNEO O INVENTADO (31-35) ---
  { input: "necesito un condensador de fluzo para mi dmc", tipo: "bloqueo_articulo" },
  { input: "quiero la pieza esa rara kshbfjkshf de un seat", tipo: "bloqueo_articulo" },
  { input: "tienes un perrito piloto de repuesto", tipo: "bloqueo_articulo" },
  { input: "busco cacharro de plastico del motor", tipo: "bloqueo_articulo" },
  { input: "espejo de plasma cuantico", tipo: "bloqueo_articulo" },

  // --- BLOQUEOS CONTROLADOS: MARCA ERRÓNEA O INVENTADO (36-40) ---
  { input: "faro izquierdo de jksdfhkjs clio", tipo: "bloqueo_marca" },
  { input: "motor para un coche marca mcdonalds", tipo: "bloqueo_marca" },
  { input: "alternador de la marca nike", tipo: "bloqueo_marca" },
  { input: "paragolpes delantero de un coche inventado", tipo: "bloqueo_marca" },
  { input: "bomba de agua para marca pepinillo", tipo: "bloqueo_marca" }
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
  console.log(`${CYAN}🚀 INICIANDO SUITE DE PRUEBAS AUTOMATIZADA: 40 ESCENARIOS CON IA REAL${RESET}`);
  console.log(`${CYAN}======================================================================\n${RESET}`);

  let pasados = 0;
  let fallados = 0;

  for (let i = 0; i < casosDePrueba.length; i++) {
    const caso = casosDePrueba[i];
    const sessionId = `suite_session_${Date.now()}_${i}`;
    
    console.log(`${YELLOW}[Caso ${i + 1}/40]${RESET} "${caso.input}"`);
    process.stdout.write(`⏳ Analizando... `);

    const respuestaBot = await enviarMensaje(caso.input, sessionId);

    if (respuestaBot.error) {
      console.log(`\n${RED}❌ ERROR CRÍTICO DE RED/AUTENTICACIÓN:${RESET} ${respuestaBot.error}`);
      return;
    }

    const textoBot = respuestaBot.respuesta.toLowerCase();
    let pasoElTest = false;
    let detalleVerificacion = "";

    if (caso.tipo === "exito") {
      const noHayErrores = !textoBot.includes("no reconozco la marca") && !textoBot.includes("no estoy seguro a que pieza");
      if (noHayErrores) {
        pasoElTest = true;
        
        if (caso.verificar) {
          const contextoMemoria = JSON.parse(respuestaBot.nuevoContexto || "{}");
          const valorExtraido = (contextoMemoria[caso.verificar.campo] || "").toLowerCase();
          
          if (valorExtraido && valorExtraido.includes(caso.verificar.esperado.toLowerCase())) {
            detalleVerificacion = ` -> [Corregido correctamente a: "${contextoMemoria[caso.verificar.campo]}"]`;
          } else {
            pasoElTest = false;
            detalleVerificacion = ` -> [Fallo de corrección. Esperaba: "${caso.verificar.esperado}", Encontró: "${valorExtraido}"]`;
          }
        }
      }
    } else if (caso.tipo === "bloqueo_articulo") {
      if (textoBot.includes("no estoy seguro a que pieza") || textoBot.includes("no estoy seguro a qué pieza")) {
        pasoElTest = true;
      }
    } else if (caso.tipo === "bloqueo_marca") {
      if (textoBot.includes("no reconozco la marca")) {
        pasoElTest = true;
      }
    }

    if (pasoElTest) {
      console.log(`${GREEN}✅ PASADO${RESET}${detalleVerificacion}`);
      pasados++;
    } else {
      console.log(`${RED}❌ FALLADO${RESET}${detalleVerificacion}`);
      console.log(`   🤖 Respuesta Bot: "${respuestaBot.respuesta}"`);
      console.log(`   🧠 Contexto: ${respuestaBot.nuevoContexto}\n`);
      fallados++;
    }
  }

  const porcentajeEfectividad = ((pasados / casosDePrueba.length) * 100).toFixed(2);

  console.log(`${CYAN}======================================================================${RESET}`);
  console.log(`📊 REPORTE DE CALIDAD FINAL`);
  console.log(`${CYAN}======================================================================${RESET}`);
  console.log(`${GREEN}✅ Pruebas Superadas: ${pasados} / ${casosDePrueba.length}${RESET}`);
  console.log(`${RED}❌ Pruebas Falladas: ${fallados} / ${casosDePrueba.length}${RESET}`);
  console.log(`${MAGENTA}📈 Índice de Efectividad: ${porcentajeEfectividad}%${RESET}`);
  console.log(`${CYAN}======================================================================\n${RESET}`);
}

ejecutarMegaSuite();