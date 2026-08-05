import * as wasm from 'kaspa-wasm';
try {
  const pk = new wasm.PrivateKey("b7163628e93297a7eb20194bc0ecf79b32c69cb5e48d3db816edcfd330c9d7d2"); // Alice simnet privkey
  const expectedAddress = pk.toKeypair().toAddress("simnet").toString();
  console.log("Expected address:", expectedAddress);
} catch (e) {
  console.log("Error toAddress simnet:", e);
}
try {
  const pk = new wasm.PrivateKey("b7163628e93297a7eb20194bc0ecf79b32c69cb5e48d3db816edcfd330c9d7d2"); // Alice simnet privkey
  const expectedAddress = pk.toKeypair().toAddress("kaspasim").toString();
  console.log("Expected address kaspasim:", expectedAddress);
} catch (e) {
  console.log("Error toAddress kaspasim:", e);
}
