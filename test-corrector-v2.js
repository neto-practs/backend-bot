const { validarYCorregir } = require("./src/utils/correctorOrtografico");

const testCases = [
  {
    name: "Swap Seat from model to brand + correction",
    ctx: { articulo: "alternador", marca: null, modelo: "Seatt" }, // "Seatt" should match "SEAT"
    expected: { articulo: "ALTERNADOR", marca: "SEAT", modelo: null }
  },
  {
    name: "Correct typo in article",
    ctx: { articulo: "aletaa", marca: "Audi", modelo: "A3" },
    expected: { articulo: "ALETA", marca: "AUDI", modelo: "A3" } // A3 stays as is
  },
  {
    name: "Model protection (no correction)",
    ctx: { articulo: "alternador", marca: "Audi", modelo: "Ibizaaaa" },
    expected: { articulo: "ALTERNADOR", marca: "AUDI", modelo: "Ibizaaaa" } // Ibizaaaa is kept
  },
  {
    name: "Garbage article -> Error",
    ctx: { articulo: "asdfgghjkl", marca: "Audi", modelo: "A3" },
    shouldError: true
  },
  {
    name: "Everything in the wrong place",
    ctx: { articulo: "BMW", marca: "Ibiza", modelo: "alternador" },
    expected: { articulo: "ALTERNADOR", marca: "BMW", modelo: "Ibiza" } // Ibiza is model, kept as is
  }
];

testCases.forEach(test => {
  console.log(`\n--- Running test: ${test.name} ---`);
  const result = validarYCorregir(test.ctx);
  
  if (test.shouldError) {
    if (result.error) {
      console.log("✅ Got expected error:", result.mensaje);
    } else {
      console.log("❌ Expected error but got success:", JSON.stringify(result.contextoCorregido));
    }
  } else {
    if (result.error) {
      console.log("❌ Got unexpected error:", result.mensaje);
    } else {
      console.log("Input:", JSON.stringify(test.ctx));
      console.log("Output:", JSON.stringify(result.contextoCorregido));
      console.log("✅ Success");
    }
  }
});
