import * as wasm from 'kaspa-wasm';
function test(addrStr) {
  try {
    const addr = new wasm.Address(addrStr);
    console.log("Parsed", addrStr.substring(0,20), "...", "OK");
  } catch (e) {
    console.log("Error parsing", addrStr.substring(0,20), "...", e);
  }
}
test("kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn"); // Alice
test("kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980"); // Bob
test("kaspa:sim_carol"); // Carol
test("kaspasim:qrufd2w3lpsnklrhl7369uuyq4sl537mngsqpxswh9csq3305y2j5nsw7qskp"); // Dave
