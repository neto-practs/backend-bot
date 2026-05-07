/**
 * SCRIPT DE PRUEBAS END-TO-END (E2E) - NETO BACKEND
 * 
 * Este script simula conversaciones de usuarios reales contra la API del chatbot.
 * Gestiona automáticamente el contexto para mantener el hilo de la conversación.
 * 
 * Ejecución: node test-e2e.js
 */

// Configuración de la API y campos (Ajustado según el código real del backend)
const CONFIG = {
    URL: "http://localhost:4000/api/chat",
    API_KEY: "mi_token", // Cambiar por el valor real en .env
    FIELDS: {
        MESSAGE: "message",      // Cambiar a "promptUsuario" si la API cambia
        CONTEXT: "contexto",     // Cambiar a "contextoAnterior" si la API cambia
        RESPONSE: "respuesta",
        NEW_CONTEXT: "nuevoContexto"
    }
};

const REQ_ID_PREFIX = "usuario-test-";

// Configuración de los flujos de conversación (10 ejemplos de 5-6 mensajes)
const ESCENARIOS = [
    {
        nombre: "Búsqueda Alternador Seat Ibiza",
        prompts: [
            "Hola, buenos días",
            "Busco un alternador para mi coche",
            "Es un Seat",
            "Un Ibiza del 2010",
            "¿Tenéis stock?",
            "Vale, muchas gracias"
        ]
    },
    {
        nombre: "Búsqueda Motor BMW 320d",
        prompts: [
            "Buenas, necesito un motor completo",
            "Es para un BMW",
            "Serie 3, el 320d",
            "Año 2015",
            "¿Qué precio tiene?",
            "Perfecto, lo consulto"
        ]
    },
    {
        nombre: "Búsqueda Faro Audi A3 con Referencia",
        prompts: [
            "Busco un faro delantero izquierdo",
            "Para un Audi A3",
            "Del año 2018",
            "La referencia es 8V0941033",
            "¿Está disponible?",
            "Gracias por la info"
        ]
    },
    {
        nombre: "Búsqueda Puerta Mercedes C220",
        prompts: [
            "Hola, ¿tenéis puertas?",
            "Necesito la delantera derecha",
            "Es un Mercedes Clase C W205",
            "Color blanco si puede ser",
            "Es del 2016",
            "Adiós"
        ]
    },
    {
        nombre: "Búsqueda Caja Cambios Ford Focus",
        prompts: [
            "Caja de cambios manual",
            "Ford Focus",
            "Motor 1.6 TDCI",
            "De 2012",
            "¿Cuántos km tiene el coche de desguace?",
            "Entendido"
        ]
    },
    {
        nombre: "Búsqueda Compresor AC Renault Megane",
        prompts: [
            "No me sale aire frío en el coche",
            "Creo que necesito el compresor del aire",
            "Renault Megane 3",
            "Del 2011",
            "¿Tenéis alguno que funcione bien?",
            "Vale"
        ]
    },
    {
        nombre: "Búsqueda Retrovisor Toyota Auris",
        prompts: [
            "Espejo retrovisor",
            "Toyota Auris del 2014",
            "El del lado derecho",
            "¿Es eléctrico?",
            "Vale, me sirve",
            "Gracias"
        ]
    },
    {
        nombre: "Búsqueda Llantas VW Golf",
        prompts: [
            "Busco llantas de aleación",
            "Para un VW Golf 7",
            "En 17 pulgadas",
            "¿Tenéis el juego de 4?",
            "¿Qué diseño tienen?",
            "Me lo pienso"
        ]
    },
    {
        nombre: "Búsqueda Asientos Opel Astra",
        prompts: [
            "Asientos de tela",
            "Opel Astra J",
            "De 5 puertas",
            "¿Están limpios?",
            "Pásame fotos si puedes",
            "Hasta luego"
        ]
    },
    {
        nombre: "Búsqueda Turbo Hyundai Tucson",
        prompts: [
            "Busco un turbo",
            "Hyundai Tucson",
            "Motor 2.0 CRDI",
            "Año 2017",
            "¿Tenéis alguno revisado?",
            "Gracias"
        ]
    }
];

/**
 * Función para añadir un retraso
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Ejecuta un escenario de conversación completo
 */
async function ejecutarEscenario(escenario, index) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 INICIANDO ESCENARIO ${index + 1}: ${escenario.nombre}`);
    console.log(`${'='.repeat(60)}\n`);

    let memoriaContexto = "{}";
    const reqId = `${REQ_ID_PREFIX}${String(index + 1).padStart(3, '0')}`;

    for (const prompt of escenario.prompts) {
        console.log(`👤 Usuario: "${prompt}"`);

        try {
            const payload = {
                [CONFIG.FIELDS.MESSAGE]: prompt,
                [CONFIG.FIELDS.CONTEXT]: memoriaContexto,
                reqId: reqId
            };

            const response = await fetch(CONFIG.URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": CONFIG.API_KEY
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error(`❌ Error API (${response.status}):`, errorData.error || response.statusText);
                break;
            }

            const data = await response.json();
            
            console.log(`🤖 Bot: "${data[CONFIG.FIELDS.RESPONSE] || '(Sin respuesta de texto)'}"`);
            
            if (data.piezas && data.piezas.length > 0) {
                console.log(`📦 Piezas encontradas: ${data.piezas.length}`);
            }

            // REGLA DE ORO: Actualizar contexto
            memoriaContexto = data[CONFIG.FIELDS.NEW_CONTEXT] || "{}";
            console.log(`🧠 Contexto Oculto: ${memoriaContexto}`);
            console.log('------------------------------------------------------------');

            // Pausa de 1 segundo entre mensajes para simular realidad
            await sleep(1000);

        } catch (error) {
            console.error("❌ Error de red/petición:", error.message);
            break;
        }
    }
}

/**
 * Función principal que orquesta todas las pruebas
 */
async function runAllTests() {
    console.log("🏁 INICIANDO BATERÍA DE PRUEBAS E2E PARA NETO-BACKEND");
    console.log(`Fecha: ${new Date().toLocaleString()}`);
    
    for (let i = 0; i < ESCENARIOS.length; i++) {
        await ejecutarEscenario(ESCENARIOS[i], i);
        // Pequeña pausa entre escenarios
        await sleep(2000);
    }

    console.log("\n✅ TODAS LAS PRUEBAS HAN FINALIZADO");
}

// Ejecutar el script
runAllTests().catch(err => {
    console.error("💥 Error fatal en el script de pruebas:", err);
});
