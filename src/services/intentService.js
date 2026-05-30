const { NlpManager } = require("node-nlp");
const logger = require("../utils/logger");

const corpusGeneral = require("../data/corpus-general.json");
const corpusDesguace = require("../data/corpus-desguace.json");

const { construirQuery } = require("../utils/queryBuilder");

const manager = new NlpManager({ languages: ["es"], forceNER: false });

const loadCorpus = (corpus) => {
  corpus.data.forEach((item) => {
    // Leemos las frases para entrenarla
    item.utterances.forEach((frase) => {
      manager.addDocument("es", frase, item.intent);
    });
    if (item.answers) {
      // Le enseñamos las respuestas también
      item.answers.forEach((respuesta) => {
        manager.addAnswer("es", item.intent, respuesta);
      });
    }
  });
};

//Funcion para fusionar ambos entrenamientos y llamarla al encender server
const trainNLP = async () => {
  try {
    logger.info("Iniciando entrenamiento NLP...");

    loadCorpus(corpusGeneral);
    loadCorpus(corpusDesguace);

    await manager.train();
    await manager.save(); //guardamos el entrenamiento

    logger.info("Motor NLP entrenado y guardado con éxito");
  } catch (error) {
    logger.error(" Error entrenando el NLP:", error);
  }
};

const detectIntent = async (textoUsuario) => {
  if (!textoUsuario)
    return { intent: "None", queryLimpia: "", desglose: null, respuestaAutomatica: "" };

  // Buscamos la intencion
  const respuestaIA = await manager.process("es", textoUsuario);
  let intentFinal = respuestaIA.intent;

  const resultadoQuery = construirQuery(textoUsuario);
  const queryLimpia = resultadoQuery.queryFinal;
  const desglose = resultadoQuery.desglose;

  //Intents principales que llama la atencion resaltar
  const intentsIntocables = [
    "user.angry",
    "greetings.bye",
    "courtesy.positive",
    "dialog.sorry",
  ];

  if (intentsIntocables.includes(intentFinal) && respuestaIA.score > 0.8) {
    logger.info(`Respetando emoción del usuario: ${intentFinal}`);
  } else if (queryLimpia.length > 0) {
    intentFinal = "search.part";
    
    // Si no hay palabras clave y la IA encima duda mucho, lo mandamos a None
  } else if (intentFinal === "None" || respuestaIA.score < 0.6) {
    
    intentFinal = "None";
  }

  return {
    intent: intentFinal,
    queryLimpia: queryLimpia,
    desglose: desglose,
    respuestaAutomatica:
      respuestaIA.answer ||
      "No te he entendido bien. Por favor, dime que pieza buscas y para que coche.",
  };
};

module.exports = { trainNLP, detectIntent };
