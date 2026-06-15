# neto-backend

IA conversacional para desguaces de vehículos. Gestiona búsquedas por cascada de campos (artículo → marca → modelo → año → versión), también cabe destacar que entiende referencias OEM,  base de conocimiento comercial y conexión a la API del catálogo de piezas.

---

## Arranque rápido

```bash
# Instalar dependencias
npm install

# Desarrollo (hot-reload), gracias a nodemon. 
npm run dev

# Producción (En el servidor, fuera del localhost)
npm start
```

Localhost disponible en `http://localhost:4000`

Servidor de producción: subir los cambios a git y recogerlos desde el servidor:

git pull origin main
npm install                # instala dependencias nuevas si las hay
pm2 restart neto-backend
---

## Variables de entorno

Crea un archivo `.env` en la raíz con estas variables:

```bash
# Puerto del servidor
PORT=4000
LOG_LEVEL=info

# Motor del bot: PREMIUM (vLLM Qwen) o FREE (NLP local)
MODO_BOT=PREMIUM

# Conexión al modelo de IA en RunPod
RUNPOD_IA_URL=https://<tu-endpoint>.proxy.runpod.net/v1/chat/completions
RUNPOD_IA_TOKEN=<tu-token>
RUNPOD_IA_MODEL=Qwen/Qwen2.5-14B-Instruct-AWQ
RUNPOD_AI_TEMPERATURE=0.2
RUNPOD_AI_MAX_TOKENS=400

# URL base de la tienda del cliente
STORE_BASE_URL=https://dev4premium.desguacesyrecambios.com

# Timeouts (ms)
API_TIMEOUT_MS=10000
SUGERENCIAS_TIMEOUT=30000

# Circuit Breaker
CB_Umbral=5
CB_Reset=60000

# Caché
CACHE_TTL_SECONDS=600
ADMIN_CACHE_KEY=<clave-admin>
CACHE_METRICS_INTERVAL_MINUTES=10

# Rate limiting
limit=100

# Reglas de negocio
LIMITE_GENERICO=500
```

---

## Estructura del proyecto

```
src/
├── config/
│   ├── clientes.js         ← Clientes autorizados (CORS + API key)
│   ├── constants.js        ← Constantes globales
│   └── prompts.js          ← Prompts del Router y Extractor (vLLM)
│
├── controllers/
│   ├── chatController.js   ← Orquesta PREMIUM vs FREE
│   └── healthController.js ← GET /api/health
│
├── services/
│   ├── aiService.js        ← Motor PREMIUM (vLLM Qwen 2.5 14B)
│   ├── chatService.js      ← Motor FREE (NLP local)
│   ├── intentService.js    ← Entrenamiento NLP
│   └── cacheService.js     ← Caché LRU en memoria
│
├── repositories/
│   └── apiRepository.js    ← Conexión a API de piezas (Circuit Breaker)
│
├── middlewares/
│   ├── auth.js             ← Valida API key y cliente
│   ├── rateLimiter.js      ← 100 peticiones/min por IP
│   ├── requestLogger.js    ← Asigna UUID a cada petición
│   └── errorHandler.js     ← Captura errores globales
│
├── utils/
│   ├── correctorOrtografico.js  ← Corrige artículos y marcas
│   ├── contextHelper.js         ← Fusión de contexto conversacional
│   ├── dialogHelper.js          ← Genera respuestas y determina campo faltante
│   ├── validadorVehiculo.js     ← Coherencia marca↔modelo
│   ├── textNormalizer.js        ← Limpieza de texto
│   ├── formateadorPiezasReact.js ← Convierte piezas para el frontend
│   └── logger.js                ← Logger Pino
│
└── data/
    ├── mapaVehiculos.js         ← Catálogo: marca → modelo → años
    ├── diccionarioMarcas.js     ← Marcas + sinónimos
    ├── diccionarioArticulos.js  ← Piezas + sinónimos
    ├── diccionarioModelos.js    ← Modelos por marca
    ├── diccionarioVersiones.js  ← Versiones técnicas
    ├── corpus-general.json      ← Entrenamiento NLP genérico
    └── corpus-desguace.json     ← Entrenamiento NLP específico
```

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/chat` | Mensaje del usuario → respuesta del bot |
| `POST` | `/api/chat/cache/flush` | Vaciar caché (requiere `x-cache-key`) |
| `GET`  | `/api/health` | Estado del sistema y API externa |

### POST /api/chat

**Headers requeridos:**
```
Content-Type: application/json
Origin: https://tu-dominio.com
api-key: <backendApiKey del cliente> (lo recoges del /src/config/clientes.js)
```

**Body:**
```json
{
  "message": "necesito un alternador para un ford focus",
  "contexto": "{\"articulo\":null,\"marca\":null,\"modelo\":null,\"ano\":null,\"version\":null}"
}
```

**Respuesta:**
```json
{
  "respuesta": "He encontrado 3 opciones en stock.",
  "piezas": [...],
  "sugerencias": [],
  "campoFaltante": null,
  "pedirWhatsapp": false,
  "nuevoContexto": "{...}",
  "metadata": { "totalReal": 3, "queryLimpia": "alternador ford focus" }
}
```

---

## Añadir un nuevo cliente

1. Abre `src/config/clientes.js`
2. Añade la URL de origen + configuración:

```js
"https://dominio-del-cliente.com": {
  id: "cliente_002",
  storeUrl: "https://dominio-del-cliente.com",
  backendApiKey: "clave-secreta-del-cliente",
},
```

3. Reinicia el servidor (`pm2 restart neto-backend`)
4. El frontend debe enviar el header `api-key: clave-secreta-del-cliente`

---

## Gestión con PM2

```bash
# Ver estado
pm2 list

# Reiniciar
pm2 restart neto-backend

# Ver logs en tiempo real
pm2 logs neto-backend

# Parar
pm2 stop neto-backend
```

---

## Pruebas

```bash
# Prueba de placeholders de contacto (22 casos)
node test-placeholders.js
```

---

## Modos del bot

| Modo | Variable | Descripción |
|------|----------|-------------|
| `PREMIUM` | `MODO_BOT=PREMIUM` | Usa vLLM Qwen 2.5 14B (RunPod). Mejor comprensión. |
| `FREE` | `MODO_BOT=FREE` | NLP local con node-nlp. Sin dependencia externa. |

Si `PREMIUM` falla (timeout, caída de RunPod), el sistema hace **fallback automático** a `FREE`.
