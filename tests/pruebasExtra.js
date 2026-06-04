/**
 * pruebasExtra.js
 * Tests dirigidos a los cambios recientes:
 *  - Artículos multi-palabra (piloto delantero, persiana enrollable...)
 *  - Marcas/modelos multi-palabra (land rover, alfa romeo, serie 3)
 *  - Modelos numéricos en cascada (320, i20, 208)
 *  - Preservación de contexto tras sin-stock
 *  - Router: peticiones de sugerencias durante cascada
 *  - Cambio de pieza / corrección a mitad de conversación
 */

const API_URL = "http://localhost:4000/api/chat";
const API_KEY = "clave_local";

const COLORS = {
  GREEN:   "\x1b[32m", RED:    "\x1b[31m", YELLOW: "\x1b[33m",
  CYAN:    "\x1b[36m", MAGENTA:"\x1b[35m", WHITE:  "\x1b[37m",
  BOLD:    "\x1b[1m",  RESET:  "\x1b[0m"
};

const suites = [
  {
    nombre: "A. ARTÍCULOS MULTI-PALABRA (no deben perder palabras)",
    secuencial: false,
    casos: [
      { msg: "piloto delantero bmw serie 3",          esperado: "piloto delantero" },
      { msg: "piloto delantero izquierdo audi a4",     esperado: "piloto delantero izquierdo" },
      { msg: "espejo retrovisor izquierdo ford focus",  esperado: "espejo retrovisor izquierdo" },
      { msg: "persiana enrollable electrica de puerta seat ibiza", esperado: "persiana enrollable electrica de puerta" },
      { msg: "paragolpes delantero alfa romeo giulietta", esperado: "paragolpes delantero" },
      { msg: "absorbedor delantero volkswagen golf",    esperado: "absorbedor delantero" },
      { msg: "airbag lateral delantero izquierdo seat leon", esperado: "airbag lateral delantero izquierdo" },
    ]
  },
  {
    nombre: "B. MARCAS/MODELOS MULTI-PALABRA",
    secuencial: false,
    casos: [
      { msg: "faro land rover range rover",           esperado: "land rover" },
      { msg: "motor alfa romeo giulietta",            esperado: "alfa romeo" },
      { msg: "alternador alfa romeo 147",             esperado: "alfa romeo" },
      { msg: "amortiguador land rover discovery",     esperado: "land rover" },
    ]
  },
  {
    nombre: "C. MODELOS NUMÉRICOS EN CASCADA (multi-turno)",
    secuencial: true,
    turnos: [
      { msg: "necesito un alternador para bmw" },
      { msg: "320",     check: "modelo en ctx" },
      { msg: "2018",    check: "ano en ctx" },
    ]
  },
  {
    nombre: "D. MODELO NUMÉRICO CORTO (i20, 208)",
    secuencial: true,
    turnos: [
      { msg: "busco limpiaparabrisas para hyundai" },
      { msg: "i20",     check: "modelo en ctx" },
      { msg: "2016",    check: "ano en ctx" },
    ]
  },
  {
    nombre: "E. CASCADA COMPLETA: pieza → marca → modelo numérico → año",
    secuencial: true,
    turnos: [
      { msg: "necesito un alternador" },
      { msg: "peugeot" },
      { msg: "208" },
      { msg: "2019" },
    ]
  },
  {
    nombre: "F. SIN STOCK → SUGERENCIAS DE AÑO (no debe borrar contexto)",
    secuencial: true,
    turnos: [
      { msg: "limpia parabrisas hyundai i20 2004" },
      { msg: "dame los años que tengas" },
    ]
  },
  {
    nombre: "G. CORRECCIÓN MID-CONVERSACIÓN",
    secuencial: true,
    turnos: [
      { msg: "necesito piloto trasero seat ibiza 2008" },
      { msg: "perdona, quiero el delantero derecho" },
      { msg: "2010" },
    ]
  },
  {
    nombre: "H. CAMBIO DE PIEZA (reset de artículo, conserva coche)",
    secuencial: true,
    turnos: [
      { msg: "alternador seat ibiza 2007" },
      { msg: "espera, mejor el retrovisor" },
    ]
  },
  {
    nombre: "I. ROUTER: petición de sugerencias durante cascada",
    secuencial: true,
    turnos: [
      { msg: "faro delantero audi" },
      { msg: "no sé el modelo, dame opciones" },
    ]
  },
  {
    nombre: "J. TOLERANCIA ORTOGRÁFICA MARCA MULTI-PALABRA",
    secuencial: false,
    casos: [
      { msg: "espejo alfa romero 147" },
      { msg: "faro lan rover defensor" },
      { msg: "motor rang rover sport" },
    ]
  },
  {
    nombre: "K. REFERENCIA OEM (debe ir directa a búsqueda)",
    secuencial: false,
    casos: [
      { msg: "busco la referencia 8p0941004" },
      { msg: "tengo la ref 03g105266bh" },
    ]
  },
];

async function chat(msg, contexto = "{}") {
  const t0 = performance.now();
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": API_KEY, "Origin": "http://localhost:5173" },
      body: JSON.stringify({ message: msg, contexto: typeof contexto === "string" ? contexto : JSON.stringify(contexto) })
    });
    const ms = (performance.now() - t0).toFixed(0);
    if (!r.ok) return { error: `HTTP ${r.status}`, tiempoMs: ms };
    const d = await r.json();
    d.tiempoMs = ms;
    return d;
  } catch (e) {
    return { error: e.message, tiempoMs: 0 };
  }
}

function printTurn(input, res, hint = "") {
  if (res.error) {
    console.log(`  ${COLORS.YELLOW}▶${COLORS.RESET} "${input}"`);
    console.log(`  ${COLORS.RED}❌ ERROR:${COLORS.RESET} ${res.error}\n`);
    return;
  }
  const tColor = res.tiempoMs > 5000 ? COLORS.RED : res.tiempoMs > 2500 ? COLORS.YELLOW : COLORS.GREEN;
  let ctx = {};
  try { ctx = JSON.parse(res.nuevoContexto || "{}"); } catch(_) {}

  console.log(`  ${COLORS.YELLOW}▶ Usuario:${COLORS.RESET} "${input}"`);
  console.log(`  ${COLORS.GREEN}🤖 Bot:${COLORS.RESET} "${(res.respuesta||"").slice(0,120)}${res.respuesta?.length>120?"…":""}"`);
  console.log(`  ${COLORS.WHITE}🧠 Ctx:${COLORS.RESET} ${JSON.stringify(ctx)}`);
  if (res.sugerencias?.length)
    console.log(`  ${COLORS.CYAN}💡 Sugerencias:${COLORS.RESET} [${res.sugerencias.slice(0,6).join(", ")}]`);
  if (res.piezas?.length)
    console.log(`  ${COLORS.MAGENTA}📦 Piezas:${COLORS.RESET} ${res.piezas.length}`);
  console.log(`  ${COLORS.WHITE}⏱️${COLORS.RESET} ${tColor}${res.tiempoMs}ms${COLORS.RESET}${hint ? "  " + hint : ""}`);
  console.log("");
}

// Verifica que en el contexto el campo tiene el valor esperado
function checkCtx(res, campo, valorParcial) {
  let ctx = {};
  try { ctx = JSON.parse(res.nuevoContexto || "{}"); } catch(_) {}
  const val = (ctx[campo] || "").toLowerCase();
  const ok = val.includes(valorParcial.toLowerCase());
  return ok
    ? `${COLORS.GREEN}✓ ctx.${campo}="${ctx[campo]}"${COLORS.RESET}`
    : `${COLORS.RED}✗ ctx.${campo}="${ctx[campo]}" (esperaba incluir "${valorParcial}")${COLORS.RESET}`;
}

// Verifica que el artículo en contexto contiene la cadena esperada
function checkArticulo(res, esperado) {
  let ctx = {};
  try { ctx = JSON.parse(res.nuevoContexto || "{}"); } catch(_) {}
  const art = (ctx.articulo || "").toLowerCase();
  const ok = art.includes(esperado.toLowerCase());
  return ok
    ? `${COLORS.GREEN}✓ articulo="${ctx.articulo}"${COLORS.RESET}`
    : `${COLORS.RED}✗ articulo="${ctx.articulo}" (esperaba incluir "${esperado}")${COLORS.RESET}`;
}

async function run() {
  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}${"=".repeat(70)}${COLORS.RESET}`);
  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}🧪 SUITE DE PRUEBAS EXTRA — Cambios recientes${COLORS.RESET}`);
  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}${"=".repeat(70)}${COLORS.RESET}\n`);

  for (const suite of suites) {
    console.log(`${COLORS.CYAN}${COLORS.BOLD}📁 ${suite.nombre}${COLORS.RESET}`);
    console.log(`${COLORS.CYAN}${"-".repeat(70)}${COLORS.RESET}`);

    if (suite.secuencial) {
      let ctx = "{}";
      for (const t of suite.turnos) {
        const res = await chat(t.msg, ctx);
        let hint = "";
        if (t.check === "modelo en ctx") hint = checkCtx(res, "modelo", "");
        else if (t.check === "ano en ctx") hint = checkCtx(res, "ano", "");
        printTurn(t.msg, res, hint);
        if (!res.error) ctx = res.nuevoContexto || "{}";
      }
    } else {
      for (const c of suite.casos) {
        const res = await chat(c.msg, "{}");
        const hint = c.esperado ? checkArticulo(res, c.esperado) : "";
        printTurn(c.msg, res, hint);
      }
    }

    console.log(`${COLORS.CYAN}${COLORS.BOLD}✅ FIN DEL BLOQUE${COLORS.RESET}\n`);
  }

  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}${"=".repeat(70)}${COLORS.RESET}`);
  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}🏁 FIN SUITE EXTRA${COLORS.RESET}`);
  console.log(`${COLORS.MAGENTA}${COLORS.BOLD}${"=".repeat(70)}${COLORS.RESET}`);
}

run();
