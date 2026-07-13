import { getSpendableUtxos } from './packages/localnet/dist/index.js';

async function run() {
  const mockState = {
      networkId: "simulated",
      daaScore: "1000",
      accounts: [
        { name: "alice", address: "kaspa:sim_alice" },
        { name: "bob", address: "kaspa:sim_bob" },
        { name: "carol", address: "kaspa:sim_carol" }
      ],
      utxos: [
        {
          id: "mocktx:0",
          address: "kaspa:sim_alice",
          amountSompi: "900000000000000",
          spent: false,
          createdAtDaaScore: "100"
        },
        {
          id: "mocktx:1",
          address: "kaspa:sim_carol",
          amountSompi: "900000000000000",
          spent: false,
          createdAtDaaScore: "100"
        }
      ]
    };
    
    const unspent = getSpendableUtxos(mockState, "alice");
    console.log("Unspent UTXOs for alice:", unspent);
}
run();
