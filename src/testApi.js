const API_URL = "http://localhost:4000/api/chat";
const API_KEY = "mi_token"; // <-- ASEGÚRATE DE QUE SEA TU TOKEN REAL

// Colores para la consola
const C = {
  verde: "\x1b[32m",
  rojo: "\x1b[31m",
  amarillo: "\x1b[33m",
  azul: "\x1b[36m",
  reset: "\x1b[0m",
};

// ==========================================
// BATERÍA DE PRUEBAS SINCRONIZADA
// Orden: Articulo -> Marcas -> Familias -> Modelos -> Referencias -> Versiones
// ==========================================
const pruebas = /*[
  {
    titulo: "PRUEBA 1: Búsqueda Inicial (Extracción básica)",
    payload: {
      message: "hola, busco una caja de cambios para un audi a3",
      contexto: "",
    },
    // Articulo: caja cambios | Marca: audi | Modelo: a3
    esperado: "caja cambios audi a3",
  },
  {
    titulo: "PRUEBA 2: Suma de Versión (1.9)",
    payload: { 
      message: "es el 1.9", 
      contexto: "caja cambios audi a3" 
    },
    // Articulo: caja cambios | Marca: audi | Modelo: a3 | Version: 1.9
    esperado: "caja cambios audi a3 1.9",
  },
  {
    titulo: "PRUEBA 3: Cascada (Cambio de modelo borra versión)",
    payload: {
      message: "perdon, me he equivocado, es un a4",
      contexto: "caja cambios audi a3 1.9",
    },
    // Al cambiar a3 por a4, la versión 1.9 debe desaparecer
    esperado: "caja cambios audi a4",
  },
  {
    titulo: "PRUEBA 4: Control-Z (Error de stock no borra la memoria)",
    payload: { 
      message: "del año 2099", 
      contexto: "caja cambios audi a4" 
    },
    // El año 2099 dará 0 stock -> Se mantiene el contexto anterior
    esperado: "caja cambios audi a4",
  },
  {
    titulo: "PRUEBA 5: Modificadores (Lados no borran pieza)",
    payload: { 
      message: "izquierdo", 
      contexto: "faro seat ibiza" 
    },
    // Articulo: faro izquierdo | Marca: seat | Modelo: ibiza
    esperado: "faro izquierdo seat ibiza",
  },
  {
    titulo: "PRUEBA 6: Reseteo Total (Pieza nueva borra todo)",
    payload: {
      message: "ahora necesito un motor para un bmw 320",
      contexto: "faro izquierdo seat ibiza",
    },
    // El cambio de pieza (faro -> motor) resetea marca y modelo
    esperado: "motor bmw 320",
  },
  {
    titulo: "PRUEBA 7: Búsqueda Parcial de Versión (TDI)",
    payload: { 
      message: "tdi", 
      contexto: "caja cambios audi a3" 
    },
    // Articulo: caja cambios | Marca: audi | Modelo: a3 | Version: jtd
    esperado: "caja cambios audi a3 tdi",
  },
  {
    titulo: "PRUEBA 8: Escudo de FAQs (No ensucia el contexto)",
    payload: { 
      message: "horario", 
      contexto: "caja cambios audi a3 tdi" 
    },
    // No es búsqueda -> El contexto se queda igual
    esperado: "caja cambios audi a3 tdi",
  },
];*/
[
  {
    titulo: "PRUEBA 9: Marca de dos palabras (Alfa Romeo)",
    payload: { message: "busco alternador para alfa romeo 147", contexto: "" },
    // Articulo: alternador | Marca: alfa romeo | Modelo: 147
    esperado: "alternador alfa romeo 147",
  },
  {
    titulo: "PRUEBA 10: Versión TDI (Éxito en Audi)",
    payload: { message: "tdi", contexto: "caja cambios audi a3 1.9" },
    // Debe sumar la versión 'tdi' al final porque para Audi SÍ suele haber stock
    esperado: "caja cambios audi a3 1.9 tdi",
  },
  {
    titulo: "PRUEBA 11: Similitud (Typo en Artículo)",
    payload: { message: "necesito el paragolpe delantero", contexto: "golf" },
    // Corrige 'paragolpe' por 'paragolpes' (asumiendo que así está en tu diccionario)
    esperado: "paragolpes delantero golf",
  },
  {
    titulo: "PRUEBA 12: Múltiples Modificadores (Lado + Posición)",
    payload: { message: "aleta delantera derecha", contexto: "audi a4" },
    // Suma modificadores al artículo
    esperado: "aleta delantera derecha audi a4",
  },
  {
    titulo: "PRUEBA 13: Búsqueda por Referencia Pura",
    payload: { message: "tienes la pieza 03L103469?", contexto: "" },
    // Detecta la referencia y limpia el resto
    esperado: "03L103469",
  },
  {
    titulo: "PRUEBA 14: Cambio de Coche (Mantiene la pieza)",
    payload: { message: "ahora para un seat leon", contexto: "alternador alfa romeo 147" },
    // El modelo cambia, la versión anterior (147) desaparece, pero el alternador se queda
    esperado: "alternador seat leon",
  },
  {
    titulo: "PRUEBA 15: Versión compuesta (Letra suelta)",
    payload: { message: "es el 1.9 d", contexto: "motor volvo v40" },
    // En Volvo el '1.9 d' es una versión común en el Excel
    esperado: "motor volvo v40 1.9 d",
  },
  {
    titulo: "PRUEBA 16: Control-Z con Basura/Insultos",
    payload: { message: "esto es una porqueria", contexto: "caja cambios audi a3 1.9 tdi" },
    // El bot no debería identificar nada nuevo y devolver el contexto anterior intacto
    esperado: "caja cambios audi a3 1.9 tdi",
  },
  {
    titulo: "PRUEBA 17: Reset Total por Nueva Pieza",
    payload: { message: " busco un retrovisor para un ford focus", contexto: "motor volvo v40 1.9 d" },
    // Al decir una pieza nueva ("retrovisor") y un coche nuevo, lo anterior muere
    esperado: "retrovisor ford focus",
  },
  {
    titulo: "PRUEBA 18: Búsqueda por Familia",
    payload: { message: "busco piezas de iluminacion", contexto: "" },
    // Detecta la familia 'iluminacion'
    esperado: "iluminacion",
  }
];

async function ejecutarPruebas() {
  console.clear();
  console.log(`${C.azul}======================================================${C.reset}`);
  console.log(`${C.azul}   🤖 INICIANDO TEST DE INTEGRACIÓN DEL CHATBOT       ${C.reset}`);
  console.log(`${C.azul}======================================================\n${C.reset}`);

  let pasadas = 0;

  for (let i = 0; i < pruebas.length; i++) {
    const p = pruebas[i];
    console.log(`${C.amarillo}▶ ${p.titulo}${C.reset}`);
    console.log(`   ├─ Contexto Anterior : "${p.payload.contexto}"`);
    console.log(`   ├─ Mensaje Usuario   : "${p.payload.message}"`);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": API_KEY },
        body: JSON.stringify(p.payload),
      });

      if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

      const data = await response.json();
      const contextoDevuelto = data.nuevoContexto || "";

      if (contextoDevuelto === p.esperado) {
        console.log(`   └─ ${C.verde}✅ ÉXITO:${C.reset} El bot devolvió exactamente -> "${contextoDevuelto}"\n`);
        pasadas++;
      } else {
        console.log(`   └─ ${C.rojo}❌ FALLO:${C.reset}`);
        console.log(`${C.rojo}      ├─ Esperábamos: "${p.esperado}"${C.reset}`);
        console.log(`${C.rojo}      └─ Recibimos:   "${contextoDevuelto}"${C.reset}\n`);
      }
    } catch (error) {
      console.log(`   └─ ${C.rojo}⚠️ ERROR FATAL:${C.reset} ${error.message}\n`);
    }

    await new Promise((r) => setTimeout(r, 400)); 
  }

  console.log(`${C.azul}======================================================${C.reset}`);
  if (pasadas === pruebas.length) {
    console.log(`${C.verde}🏆 RESULTADO: PERFECTO (${pasadas}/${pruebas.length}). Tu lógica es de titanio.${C.reset}`);
  } else {
    console.log(`${C.rojo}⚠️ RESULTADO: FALLAN ${pruebas.length - pasadas} PRUEBAS. Revisa los logs.${C.reset}`);
  }
  console.log(`${C.azul}======================================================${C.reset}`);
}

ejecutarPruebas();