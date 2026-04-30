const fs = require("fs");
const csv = require("csv-parser");
const { DICCIONARIO_MARCAS } = require("../data/diccionarioMarcas");
const { DICCIONARIO_MODELOS } = require("../data/diccionarioModelos");

const marcasYModelos = new Set(
  [
    ...Object.values(DICCIONARIO_MARCAS).flat(),
    ...Object.values(DICCIONARIO_MODELOS).flat(),
  ].map((t) => t.toLowerCase().trim()),
);

const versionesSet = new Set();
let totalLineas = 0;
let bloqueados = 0;

fs.createReadStream("desguaces_parts.csv")
  .pipe(csv({ separator: "," }))
  .on("data", (row) => {
    totalLineas++;
    const keys = Object.keys(row);
    const fraseVersion = row[keys[2]]; // La frase completa: "JTD 115 DISTINTIVE"

    if (fraseVersion && fraseVersion.trim() !== "") {
      const versionLimpia = fraseVersion.toLowerCase().trim();

      // Filtramos para que no se cuelen marcas/modelos que ya tenemos
      if (!marcasYModelos.has(versionLimpia)) {
        versionesSet.add(versionLimpia);
      } else {
        bloqueados++;
      }
    }
  })
  .on("end", () => {
    const resultado = Array.from(versionesSet).sort();
    const contenido = `const DICCIONARIO_VERSIONES = ${JSON.stringify(resultado, null, 2)};\n\nmodule.exports = { DICCIONARIO_VERSIONES };`;

    if (!fs.existsSync("./src/data"))
      fs.mkdirSync("./src/data", { recursive: true });
    fs.writeFileSync("./src/data/diccionarioVersiones.js", contenido);

    console.log(
      `✅ ¡Hecho! Extraídas ${resultado.length} frases de versiones.`,
    );
    console.log(
      `📊 Líneas totales: ${totalLineas} | Bloqueados por marca/modelo: ${bloqueados}`,
    );
  });
