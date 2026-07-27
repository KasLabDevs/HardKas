import kaspa from 'kaspa-wasm';
try {
  const privKey = new kaspa.PrivateKey("1234567890123456789012345678901234567890123456789012345678901234");
  const pubKeyHex = privKey.toKeypair().publicKey;
  const pubKey = new kaspa.PublicKey(pubKeyHex);
  const address = pubKey.toAddress(kaspa.NetworkType.Simnet);
  console.log("payload", address.payload);
} catch (e) { console.error(e) }
