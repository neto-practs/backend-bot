/**
 * pruebasJL.js
 * Suite de pruebas exhaustiva basada en los casos de informacion.txt
 * Mantiene el contexto secuencialmente dentro de cada bloque.
 */

const API_URL = "http://localhost:4000/api/chat";
const API_KEY = "clave_local";

const COLORS = {
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  CYAN: "\x1b[36m",
  MAGENTA: "\x1b[35m",
  WHITE: "\x1b[37m",
  BOLD: "\x1b[1m",
  RESET: "\x1b[0m"
};

const suiteDePruebas = [
  {
    nombre: "1. Pruebas básicas de faltas ortográficas",
    casos: [
      "nesesito un alternador",
      "busco un para golpes",
      "teneis un capó",
      "teneis capo golf v",
      "necesito retrobisor izquierdo",
      "piloto trasro seat leon",
      "quiero una caja de canvios audi a4",
      "airvak ford focus",
      "radiador renaul megane",
      "amortiguador traseroo"
    ]
  },
  {
    nombre: "2. Errores típicos humanos (Letras cambiadas)",
    casos: [
      "altelnador",
      "parachoqe",
      "salpicaderooo",
      "retrovissor",
      "inyectrores",
      "turvo",
      "cigueñal",
      "direcsion asistida"
    ]
  },
  {
    nombre: "3. Escritura rápida desde móvil",
    casos: [
      "necesito foco dcho ibiza",
      "busco caja cambios bmw 320d",
      "ay paragolpes delantero",
      "precio turbo passat",
      "hola necesitaria puerta trasera",
      "teneis algo para un clio 2007"
    ]
  },
  {
    nombre: "4. Sin signos ni estructura",
    casos: [
      "hola buenas necesito un alternador para un opel astra 2008no",
      "seat leon 2004 piloto izquierdo",
      "motor citroen c4 hdi cuanto vale",
      "teneis airbags audi a3 8p",
      "paragolpes golf v negro"
    ]
  },
  {
    nombre: "5. Mensajes extremadamente mal escritos",
    casos: [
      "nesecitava un motro pa un laguna del 2006",
      "ola kiero un turbo pa audi",
      "teneis piesas de desguase",
      "busko caja canvios",
      "me aria falta un retrobiso",
      "necestio puerta copiloto focus",
      "cuanto balen los inyetores"
    ]
  },
  {
    nombre: "6. Mezcla español + lenguaje oral",
    casos: [
      "bro teneis motores de bmw",
      "necesito una defensa delantera",
      "me hace falta el morro completo",
      "buscaba una aleta del copi",
      "teneis algo economico",
      "cuanto me saldria con envio"
    ]
  },
  {
    nombre: "7. Pruebas con marcas y modelos mal escritos",
    casos: [
      "wolsvagen golf",
      "wolksvagen tiguan",
      "mercedes bens c220",
      "peugot 307",
      "renaul scenic",
      "citroen berlingo vieja",
      "toyta corola",
      "nisan qasqai",
      "hyunday tucson"
    ]
  },
  {
    nombre: "8. Pruebas de matrículas y motores",
    casos: [
      "motor bkc golf",
      "necesito un asz",
      "teneis motor 1.9 tdi 105",
      "caja cambios jf506e",
      "motor k9k renault",
      "foco delantero 8p0941003",
      "alternador valeo tg12c"
    ]
  },
  {
    nombre: "9. Pruebas ambiguas",
    casos: [
      "necesito una pieza",
      "busco algo para mi coche",
      "teneis esto?",
      "cuanto cuesta eso",
      "la parte de delante",
      "el plastico del faro",
      "la pieza esa que va debajo"
    ]
  },
  {
    nombre: "10. Pruebas de conversación humana real",
    casos: [
      "hola buenas noches perdona molestarte necesito un espejo para un ibiza del 2003 no se si tendreis",
      "mi mecanico me pide un compresor pero no se referencia",
      "tuve un golpe y necesito frontal completo",
      "el coche es automatico no se si cambia algo",
      "quiero saber si haceis envios a valencia"
    ]
  },
  {
    nombre: "11. Usuario cambia de idea",
    casos: [
      "necesito un turbo para audi a4",
      "bueno igual era el intercooler",
      "espera le pregunto al mecanico"
    ]
  },
  {
    nombre: "12. Usuario incompleto",
    casos: [
      "tengo un seat",
      "leon",
      "2008",
      "1.9",
      "diesel"
    ]
  },
  {
    nombre: "13. Usuario contradictorio",
    casos: [
      "necesito piloto derecho",
      "perdon izquierdo",
      "no espera el del conductor"
    ]
  },
  {
    nombre: "14. Usuario agresivo o frustrado",
    casos: [
      "llevo 3 dias buscando esta pieza",
      "nadie encuentra el motor",
      "me estais mareando",
      "no eso no es mi coche"
    ]
  },
  {
    nombre: "15. Casos críticos (Referencias y Coloquiales)",
    casos: [
      "1k0823031",
      "8p0941004",
      "03g105266bh",
      "defensa",
      "foco",
      "espejo",
      "morro",
      "puerta del copi"
    ]
  },
  {
    nombre: "16. TEST DE TOLERANCIA EXTREMA",
    casos: [
      "ola buenas nesecitaria un retrobisor eletrico del lao del copi pa un wolsvagen pasat 2007 gris plata si teneis"
    ]
  }
];

async function enviarMensaje(texto, sessionId, contexto) {
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
        contexto: typeof contexto === 'string' ? contexto : JSON.stringify(contexto),
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

async function ejecutarSuiteJL() {
  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}======================================================================${COLORS.RESET}`);
  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}🚀 INICIANDO MEGA-SUITE DE PRUEBAS: PRUEBAS JL${COLORS.RESET}`);
  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}======================================================================${COLORS.RESET}\n`);

  for (const bloque of suiteDePruebas) {
    console.log(`${COLORS.CYAN}${COLORS.BOLD}📁 BLOQUE: ${bloque.nombre}${COLORS.RESET}`);
    console.log(`${COLORS.CYAN}----------------------------------------------------------------------${COLORS.RESET}`);

    let contextoActual = "{}";
    const sessionId = `jl_session_${Date.now()}_${bloque.nombre.replace(/\s+/g, '_')}`;

    for (const input of bloque.casos) {
      console.log(`${COLORS.YELLOW}▶ USUARIO:${COLORS.RESET} "${input}"`);
      
      const res = await enviarMensaje(input, sessionId, contextoActual);

      if (res.error) {
        console.log(`${COLORS.RED}❌ ERROR:${COLORS.RESET} ${res.error}\n`);
        continue;
      }

      contextoActual = res.nuevoContexto;
      const ctxPrint = JSON.parse(res.nuevoContexto || "{}");
      const colorTiempo = res.tiempoMs > 2500 ? COLORS.RED : (res.tiempoMs > 1200 ? COLORS.YELLOW : COLORS.GREEN);

      console.log(`${COLORS.GREEN}🤖 BOT:${COLORS.RESET} "${res.respuesta}"`);
      console.log(`${COLORS.WHITE}🧠 MEMORIA:${COLORS.RESET} ${JSON.stringify(ctxPrint)}`);
      console.log(`${COLORS.WHITE}⏱️ TIEMPO:${COLORS.RESET} ${colorTiempo}${res.tiempoMs}ms${COLORS.RESET}`);
      
      if (res.piezas && res.piezas.length > 0) {
        console.log(`${COLORS.MAGENTA}📦 STOCK:${COLORS.RESET} Encontradas ${res.piezas.length} piezas.`);
      }
      if (res.sugerencias && res.sugerencias.length > 0) {
        console.log(`${COLORS.CYAN}💡 SUGERENCIAS:${COLORS.RESET} [${res.sugerencias.join(", ")}]`);
      }
      
      console.log(""); // Salto de línea entre turnos
    }
    console.log(`${COLORS.CYAN}${COLORS.BOLD}✅ FIN DEL BLOQUE (Memoria Reseteada)${COLORS.RESET}\n`);
  }

  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}======================================================================${COLORS.RESET}`);
  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}🏁 FIN DE LA SUITE DE PRUEBAS JL${COLORS.RESET}`);
  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}======================================================================${COLORS.RESET}`);
}

ejecutarSuiteJL();
