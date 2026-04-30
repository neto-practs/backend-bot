const express = require("express");
const chatController = require("../controllers/chatController");
const router = express.Router();
const healthController = require("../controllers/healthController")

//Ruta: POST /api/chat
router.post("/", chatController.procesarMensaje);

//Ruta: POST /api/chat/cache/flush
router.post("/cache/flush", chatController.vaciarCacheChat);

module.exports = router;
