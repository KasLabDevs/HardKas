import { resolveHardkasAccountAddress } from "@hardkas/accounts";
import { loadOrCreateLocalnetState, getSpendableUtxos } from "@hardkas/localnet";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scratch-"));
  const localState = await loadOrCreateLocalnetState({ cwd: tmpDir });
  
  // Fake a change UTXO being saved under kaspasim:...
  const devAddress = await resolveHardkasAccountAddress("alice", {});
  localState.utxos.push({
    id: "fake-tx:1",
    address: devAddress,
    amountSompi: "5000",
    spent: false,
    createdAtDaaScore: "1"
  });

  // Now sdk.tx.plan tries to find it by querying kaspa:sim_alice
  console.log("unspent for kaspa:sim_alice:", getSpendableUtxos(localState, "kaspa:sim_alice"));
  // Or what if we query alice directly?
  console.log("unspent for alice:", getSpendableUtxos(localState, "alice"));
  // Or what if we query devAddress directly?
  console.log("unspent for devAddress:", getSpendableUtxos(localState, devAddress));
}

run().catch(console.error);
