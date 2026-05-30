const fs = require('fs');
const path = require('path');

/**
 * Función Maestra para convertir TXT en Diccionarios JS
 * @param {string} fileName - Nombre del archivo .txt original
 * @param {string} varName - Nombre de la constante que exportaremos
 * @param {string} outputFileName - Nombre del archivo .js final
 */
function transformarTxtADiccionario(fileName, varName, outputFileName) {
    try {
        // 1. Ruta absoluta para evitar errores de "archivo no encontrado"
        const filePath = path.join(__dirname, fileName);
        
        // 2. Leer el archivo con codificación UTF-8 (soporta tildes y ñ)
        const contenidoCrudo = fs.readFileSync(filePath, 'utf8');

        // 3. Limpieza profunda: separamos por comas y saltos de línea
        // También quitamos los posibles retornos de carro (\r) de Windows
        const lineas = contenidoCrudo.split(/[,\n\r]/);
        
        const diccionario = {};

        lineas.forEach(linea => {
            const nombreLimpio = linea.trim();
            
            // Filtro de seguridad: ignoramos cabeceras, líneas vacías y comentarios
            if (nombreLimpio && !nombreLimpio.startsWith('--') && nombreLimpio.length > 0) {
                // Estructura oficial: "NOMBRE": ["nombre"]
                // La clave en MAYÚSCULAS y el sinónimo en minúsculas
                diccionario[nombreLimpio] = [nombreLimpio.toLowerCase()];
            }
        });

        // 4. Preparar el texto del archivo .js final
        // Usamos JSON.stringify con 2 espacios para que sea legible por humanos
        const contenidoFinal = `// Archivo generado automáticamente - No editar a mano\n` +
                               `const ${varName} = ${JSON.stringify(diccionario, null, 2)};\n\n` +
                               `module.exports = { ${varName} };\n`;

        // 5. Guardar el resultado en la carpeta src/data/
        const outputPath = path.join(__dirname, 'src', 'data', outputFileName);
        
        // Creamos la carpeta data si por algún motivo no existiera
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(outputPath, contenidoFinal);

        console.log(`✅ ¡ÉXITO! Creado ${outputFileName} con ${Object.keys(diccionario).length} elementos.`);
        
    } catch (error) {
        console.error(`❌ ERROR procesando ${fileName}:`, error.message);
    }
}

// ==========================================
// Ejecución del generador
// ==========================================

// Procesa las Marcas
transformarTxtADiccionario('marcas.txt', 'DICCIONARIO_MARCAS', 'diccionarioMarcas.js');

// Procesa los Modelos
transformarTxtADiccionario('modelos.txt', 'DICCIONARIO_MODELOS', 'diccionarioModelos.js');

// (Cuando tengas el de artículos, solo tendrás que añadir esta línea debajo)
transformarTxtADiccionario('articulos.txt', 'DICCIONARIO_ARTICULOS', 'diccionarioArticulos.js');

transformarTxtADiccionario('familias.txt', 'DICCIONARIO_FAMILIAS', 'diccionarioFamilias.js');