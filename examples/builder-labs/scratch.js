const { PrivateKey } = require("./packages/kaspa-wasm");
const priv = new PrivateKey("0000000000000000000000000000000000000000000000000000000000000001");
const pub = priv.toKeypair().publicKey;
console.log("pubkey length:", pub.length);
console.log("pubkey:", pub);
