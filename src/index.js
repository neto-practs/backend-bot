require("dotenv").config();
const express = require("express");
const cors = require("cors");
const chatRoutes = require("./routes/chatRoutes");
const logger = require("./utils/logger");
const authMiddleware = require("./middlewares/auth");
const { apiLimiter } = require("./middlewares/rateLimiter");
const { notFoundHandler, globalErrorHandler } = require("./middlewares/errorHandler");
const { trainNLP } = require("./services/intentService");
const requestLogger = require("./middlewares/requestLogger");
const { checkHealth } = require("./controllers/healthController");
const { getClienteByOrigin } = require("./config/clientes");

const app = express();
const PORT = process.env.PORT || 4000;

// Vital al subirlo a VPS para diferenciar IPs.
app.set("trust proxy", 1);

//Configuración básica (aceptar a react en la web + entenderlo)
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    // Buscamos el Origin en nuestro archivo de clientes autorizados
    const cliente = getClienteByOrigin(origin);
    
    if (cliente) {
      // Si el cliente existe, el CORS le abre la puerta
      callback(null, true);
    } else {
      // Si no existe, el navegador bloquea la petición antes de que llegue a tu servidor
      callback(new Error(`Bloqueado por CORS: Dominio no registrado -> ${origin}`));
    }
  },
  credentials: true
}));

app.use(express.json());

app.get("/api/health", checkHealth);

app.use((req, res, next) => {
  if (req.body && req.body.message === 'ping_interno_ignorar') {
      return res.status(200).send('Ping ignorado y silenciado');
  }
  next(); // Si es una petición real, dejamos que siga bajando
});

//Middlewares Globales
app.use(requestLogger); // Ahora solo registra peticiones reales
app.use("/api", apiLimiter);

//Rutas protegidas con Auth
app.use("/api/chat", authMiddleware, chatRoutes);

//Manejo de Errores
app.use(notFoundHandler);
app.use(globalErrorHandler);

const startServer = async () => {
  try {
    await trainNLP(); // Entrenamos el cerebro primero
    app.listen(PORT, () => {
      logger.info(`Servidor listo en puerto: ${PORT}`);
    });
  } catch (error) {
    logger.error("Fallo crítico:", error);
  }
};

startServer();