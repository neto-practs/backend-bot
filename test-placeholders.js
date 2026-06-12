const http = require("http");

const BASE_URL = "http://localhost:4000";
const ORIGIN   = "http://localhost:5173";
const API_KEY  = "clave_local";

const TESTS = [
  // --- UBICACIÓN / MAPS ---
  { msg: "¿Dónde estáis?",                        expect: "[[MAPS]]",             bloque: "Ubicación" },
  { msg: "¿Cómo puedo llegar al desguace?",        expect: "[[MAPS]]",             bloque: "Ubicación" },
  { msg: "¿Cuál es vuestra dirección?",            expect: "[[MAPS]]",             bloque: "Ubicación" },
  { msg: "Necesito el mapa para ir",               expect: "[[MAPS]]",             bloque: "Ubicación" },

  // --- HORARIO ---
  { msg: "¿A qué hora abrís?",                     expect: "[[HORARIO]]",          bloque: "Horario" },
  { msg: "¿Cuándo cerráis?",                        expect: "[[HORARIO]]",          bloque: "Horario" },
  { msg: "¿Estáis abiertos por las tardes?",       expect: "[[HORARIO]]",          bloque: "Horario" },
  { msg: "¿Tenéis horario partido?",               expect: "[[HORARIO]]",          bloque: "Horario" },

  // --- TELÉFONO ---
  { msg: "¿Me podéis dar un teléfono de contacto?", expect: "[[TELEFONO]]",        bloque: "Teléfono" },
  { msg: "Quiero llamaros, ¿qué número tenéis?",   expect: "[[TELEFONO]]",        bloque: "Teléfono" },
  { msg: "¿Tenéis WhatsApp?",                      expect: "[[WHATSAPP]]",        bloque: "Teléfono", altCheck: "pedirWhatsapp" },
  { msg: "¿Por dónde os puedo contactar?",         expect: "[[TELEFONO]]",        bloque: "Teléfono" },

  // --- EMAIL ---
  { msg: "¿Cuál es vuestro email?",                expect: "[[EMAIL]]",           bloque: "Email" },
  { msg: "¿Me podéis dar el correo electrónico?",  expect: "[[EMAIL]]",           bloque: "Email" },
  { msg: "Quiero mandaros un mensaje por email",   expect: "[[EMAIL]]",           bloque: "Email" },

  // --- BAJAS Y TASACIONES ---
  { msg: "Quiero dar de baja mi coche",            expect: "[[BAJAS_TASACIONES]]", bloque: "Bajas" },
  { msg: "¿Hacéis tasaciones de vehículos?",       expect: "[[BAJAS_TASACIONES]]", bloque: "Bajas" },
  { msg: "¿Cuánto me dais por mi coche?",          expect: "[[BAJAS_TASACIONES]]", bloque: "Bajas" },
  { msg: "Quiero vender mi coche para desguace",   expect: "[[BAJAS_TASACIONES]]", bloque: "Bajas" },

  // --- SOBRE NOSOTROS ---
  { msg: "¿Quiénes sois?",                         expect: "[[SOBRE_NOSOTROS]]",  bloque: "Sobre nosotros" },
  { msg: "¿A qué os dedicáis?",                    expect: "[[SOBRE_NOSOTROS]]",  bloque: "Sobre nosotros" },
  { msg: "Quiero saber más sobre la empresa",      expect: "[[SOBRE_NOSOTROS]]",  bloque: "Sobre nosotros" },
];

function post(message) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ message, contexto: "" });
    const options = {
      hostname: "localhost",
      port: 4000,
      path: "/api/chat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Origin": ORIGIN,
        "x-api-key": API_KEY,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ _raw: data }); }
      });
    });

    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(body);
    req.end();
  });
}

async function run() {
  let pass = 0, fail = 0;
  let bloqueActual = "";

  for (const t of TESTS) {
    if (t.bloque !== bloqueActual) {
      bloqueActual = t.bloque;
      console.log(`\n── ${bloqueActual} ──`);
    }

    let respuesta = "", resObj = {};
    try {
      resObj = await post(t.msg);
      respuesta = resObj.respuesta || resObj.mensaje || resObj._raw || JSON.stringify(resObj);
    } catch (e) {
      respuesta = `ERROR: ${e.message}`;
    }

    const ok = respuesta.includes(t.expect) || (t.altCheck && resObj[t.altCheck] === true);
    const icono = ok ? "✓" : "✗";
    if (ok) pass++; else fail++;

    console.log(`${icono} "${t.msg}"`);
    if (!ok) {
      console.log(`  Esperaba: ${t.expect}`);
      console.log(`  Recibió:  ${respuesta.slice(0, 120)}`);
    }
  }

  console.log(`\n══════════════════════════`);
  console.log(`Resultado: ${pass}/${TESTS.length} correctos, ${fail} fallos`);
}

run();
