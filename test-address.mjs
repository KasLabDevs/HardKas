import * as wasm from 'kaspa-wasm';
try {
  const addr = new wasm.Address("kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn");
  console.log("Parsed Alice:", addr.toString());
} catch (e) {
  console.log("Error parsing Alice:", e);
}
try {
  const addr = new wasm.Address("kaspasim:qrufd2w3lpsnklrhl7369uuyq4sl537mngsqpxswh9csq3305y2j5nsw7qskp");
  console.log("Parsed Dave:", addr.toString());
} catch (e) {
  console.log("Error parsing Dave:", e);
}
