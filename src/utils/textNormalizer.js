/**
 * Limpia el texto para pasarselo al bot (en otra clase)
 * Lo pasa todo a minúsculas, quita acentos y borra cualquier símbolo raro
 * (comas, puntos, exclamaciones), dejando solo letras y números.
 * * @param {string} text - El mensaje original del cliente.
 * @returns {string} El texto limpito y preparado para analizar.
 */
const textNormalize = (text) => {
  if (!text) return "";

  let cleanedText = text.toLowerCase();

  //Quitamos las tildes
  cleanedText = cleanedText.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  cleanedText = cleanedText.replace(/[^a-z0-9ñ\s\.]/g, " ");

  return cleanedText.replace(/\s+/g, " ").trim();
};
module.exports = { textNormalize };
