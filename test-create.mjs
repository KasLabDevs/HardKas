import * as sdk from 'kaspa-wasm';

const utxos = [
  {
    address: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn",
    outpoint: { transactionId: "56cf68010d7cc62c333d99289427f86a2182a5c01ec35e441b1cb2c707d3ff36", index: 58 },
    utxoEntry: {
      amount: 5000000000n,
      scriptPublicKey: new sdk.ScriptPublicKey(0, "203e1b1470f13a8d64128fd6b101a762190808ff3a4df0b7a8adfc23287290cffbac"),
      blockDaaScore: 160n,
      isCoinbase: true
    }
  }
];

const outputs = [
  new sdk.PaymentOutput(
    new sdk.Address("kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980"),
    50000000n
  )
];

const changeAddr = new sdk.Address("kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn");

const tx = sdk.createTransaction(utxos, outputs, changeAddr, 2660n);
try {
  console.log("Getting inputs...");
  const inputs = tx.inputs;
  console.log("Setting inputs...");
  tx.inputs = inputs;
  console.log("OK");
} catch (e) {
  console.log("Error:", e);
}
