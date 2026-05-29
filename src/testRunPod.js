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
  // --- INTENCIÓN: CONVERSACIÓN ---
  { input: "Hola, buenos días", tipo: "conversacion" },
  { input: "Eres un bot muy tonto", tipo: "conversacion" },

  // --- INTENCIÓN: AYUDA (SUGERENCIAS) ---
  { input: "no sé que modelo es mi coche", tipo: "ayuda", esperado: true, nota: "Usuario bloqueado" },
  { input: "ayuda no se seguir", tipo: "ayuda", esperado: true, nota: "Usuario pide ayuda" },
  { input: "dame opciones", tipo: "ayuda", esperado: true, nota: "Petición de listado explícita" },

  // --- INTENCIÓN: BÚSQUEDA NORMAL / COMPLETA ---
  { input: "busco un faro delantero para un seat ibiza del 2015", tipo: "exito", nota: "Búsqueda limpia" },
  { input: "necesito espejo retrovisor izquierdo para audi a4", tipo: "exito" },
  { input: "es un audi a3", tipo: "exito", nota: "Dato directo a campo faltante" },

  // --- EXTRACCIÓN Y ADUANA: AUTOCORRECCIÓN Y COMPUESTOS ---
  { input: "hola, necesito un alternaddor", tipo: "extraccion", verificar: { campo: "articulo", esperado: "alternador" } },
  { input: "busco farro derecho para un seat marvella", tipo: "extraccion", verificar: { campo: "articulo", esperado: "faro derecho" } },
  { input: "tienes parachoques delanto", tipo: "extraccion", verificar: { campo: "articulo", esperado: "paragolpes delantero" } },

  // --- EXTRACCIÓN Y ADUANA: BLOQUEOS CONTROLADOS Y FILTRADO ---
  { input: "necesito un condensador de fluzo para mi dmc", tipo: "bloqueo_aduana", verificarBloqueo: "dmc", nota: "DMC no existe, bloquea marca." },
  { input: "faro izquierdo de jksdfhkjs clio", tipo: "extraccion", verificar: { campo: "modelo", esperado: "clio" }, nota: "IA ignora basura jksdfhkjs" },

  // --- PRUEBAS DE MEMORIA Y CASCADA (MULTI-PASO) ---
  { 
    input: "ahora busco para un BMW", 
    contextoPrevio: { articulo: "faro derecho", marca: "audi", modelo: "a4", ano: "2010" },
    tipo: "memoria_cascada", 
    nota: "Cambio de marca borra modelo y año, mantiene artículo",
    verificarMemoria: { articulo: "faro derecho", marca: "bmw", modelo: null, ano: null }
  },
  { 
    input: "mejor un alternador", 
    contextoPrevio: { articulo: "faro derecho", marca: "audi", modelo: "a4", ano: "2010" },
    tipo: "memoria_cascada", 
    nota: "Cambio de artículo mantiene el coche",
    verificarMemoria: { articulo: "alternador", marca: "audi", modelo: "a4", ano: "2010" }
  }
];

async function enviarMensaje(texto, sessionId, contextoPrevio = "{}") {
  const inicio = performance.now();
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
        contexto: typeof contextoPrevio === 'string' ? contextoPrevio : JSON.stringify(contextoPrevio),
        reqId: sessionId
      })
    });

    const fin = performance.now();
    const tiempoMs = (fin - inicio).toFixed(0);

    if (!respuesta.ok) {
      const errorText = await respuesta.text();
      return { error: `Error HTTP: ${respuesta.status} - ${errorText}`, tiempoMs };
    }

    const data = await respuesta.json();
    data.tiempoMs = tiempoMs;
    return data;
  } catch (error) {
    return { error: error.message, tiempoMs: 0 };
  }
}

async function ejecutarMegaSuite() {
  console.log(`${CYAN}======================================================================${RESET}`);
  console.log(`${CYAN}🚀 INICIANDO SUITE DE PRUEBAS: ENRUTADOR + EXTRACTOR (TIEMPOS)${RESET}`);
  console.log(`${CYAN}======================================================================\n${RESET}`);

  let pasados = 0;
  let fallados = 0;
  let tiempoTotal = 0;

  for (let i = 0; i < casosDePrueba.length; i++) {
    const caso = casosDePrueba[i];
    const sessionId = `suite_session_${Date.now()}_${i}`;
    
    console.log(`${YELLOW}[Caso ${i + 1}/${casosDePrueba.length}]${RESET} "${caso.input}" ${caso.nota ? `(${caso.nota})` : ""}`);
    process.stdout.write(`⏳ Analizando... `);

    const respuestaBot = await enviarMensaje(caso.input, sessionId, caso.contextoPrevio || "{}");

    if (respuestaBot.error) {
      console.log(`\n${RED}❌ ERROR DE CONEXIÓN:${RESET} ${respuestaBot.error}`);
      continue;
    }

    tiempoTotal += parseInt(respuestaBot.tiempoMs);
    const textoBot = (respuestaBot.respuesta || "").toLowerCase();
    const tieneSugerencias = respuestaBot.sugerencias && respuestaBot.sugerencias.length > 0;
    const contextoMemoria = JSON.parse(respuestaBot.nuevoContexto || "{}");
    
    let pasoElTest = false;
    let detalleVerificacion = "";

    switch (caso.tipo) {
      case "conversacion":
        if (!tieneSugerencias && Object.keys(contextoMemoria).length === 0) {
           pasoElTest = true;
        } else {
           detalleVerificacion = " -> [Se guardaron datos en contexto para un mensaje conversacional]";
        }
        break;

      case "ayuda":
        if (tieneSugerencias === caso.esperado || textoBot.includes("opciones") || textoBot.includes("no te preocupes")) {
          pasoElTest = true;
        } else {
          detalleVerificacion = ` -> [No se detectó intención de ayuda / No hay sugerencias]`;
        }
        break;

      case "exito":
      case "extraccion":
        pasoElTest = !textoBot.includes("no he logrado entender") && !textoBot.includes("revisarlo");
        if (pasoElTest && caso.verificar) {
          const valorExtraido = (contextoMemoria[caso.verificar.campo] || "").toLowerCase();
          if (!valorExtraido.includes(caso.verificar.esperado.toLowerCase())) {
            pasoElTest = false;
            detalleVerificacion = ` -> [Fallo extracción. Esperaba: "${caso.verificar.esperado}", Encontró: "${valorExtraido}"]`;
          }
        }
        break;

      case "bloqueo_aduana":
        if (textoBot.includes("no he logrado entender")) {
          if (caso.verificarBloqueo && textoBot.includes(caso.verificarBloqueo)) {
             pasoElTest = true;
          } else if (!caso.verificarBloqueo) {
             pasoElTest = true;
          } else {
             detalleVerificacion = ` -> [Aduana bloqueó pero no por el campo esperado: ${caso.verificarBloqueo}]`;
          }
        } else {
           detalleVerificacion = " -> [Aduana NO bloqueó el dato inventado/erróneo]";
        }
        break;

      case "memoria_cascada":
        pasoElTest = true;
        for (const [campo, valorEsperado] of Object.entries(caso.verificarMemoria)) {
          const valorReal = contextoMemoria[campo] || null;
          if (valorReal !== valorEsperado) {
            pasoElTest = false;
            detalleVerificacion += ` [Fallo en ${campo}: esperaba ${valorEsperado}, obtuvo ${valorReal}]`;
          }
        }
        break;
    }

    const colorTiempo = respuestaBot.tiempoMs > 2000 ? RED : (respuestaBot.tiempoMs > 1000 ? YELLOW : GREEN);

    if (pasoElTest) {
      console.log(`\n${GREEN}✅ PASADO${RESET} ${colorTiempo}(${respuestaBot.tiempoMs}ms)${RESET}${detalleVerificacion}`);
      pasados++;
    } else {
      console.log(`\n${RED}❌ FALLADO${RESET} ${colorTiempo}(${respuestaBot.tiempoMs}ms)${RESET}${detalleVerificacion}`);
      console.log(`   🤖 Respuesta Bot: "${respuestaBot.respuesta}"`);
      console.log(`   🧠 Contexto Resultante: ${JSON.stringify(contextoMemoria)}`);
      fallados++;
    }
  }

  const porcentajeEfectividad = ((pasados / casosDePrueba.length) * 100).toFixed(2);
  const tiempoMedio = (tiempoTotal / casosDePrueba.length).toFixed(0);

  console.log(`\n${CYAN}======================================================================${RESET}`);
  console.log(`📊 REPORTE DE CALIDAD FINAL Y RENDIMIENTO`);
  console.log(`${CYAN}======================================================================${RESET}`);
  console.log(`${GREEN}✅ Pruebas Superadas: ${pasados} / ${casosDePrueba.length}${RESET}`);
  console.log(`${RED}❌ Pruebas Falladas: ${fallados} / ${casosDePrueba.length}${RESET}`);
  console.log(`${MAGENTA}📈 Índice de Efectividad: ${porcentajeEfectividad}%${RESET}`);
  console.log(`${YELLOW}⏱️ Tiempo Medio por Respuesta: ${tiempoMedio}ms${RESET}`);
  console.log(`${CYAN}======================================================================\n${RESET}`);
}

ejecutarMegaSuite();
