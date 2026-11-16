# Your First Transaction

## Fast path: send KAS on a simnet node in three commands

Use this path when you already have a funded private key and a running node, and you just need the payment to happen.

1. If the node is not the HardKAS localnet (`ws://127.0.0.1:18210`), put its wRPC JSON URL in a `hardkas.config.mjs` in
   the folder where you run the commands. The `tx send` shortcut takes the node from this file.

   ```js
   export default {
     networks: {
       simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://<host>:18210" }
     }
   };
   ```

2. Run the commands:

   ```bash
   export PK=<private key hex>            # read with --private-key-env, never typed on the command line
   export PW=<any keystore password>      # encrypts the imported key in the local keystore
   hardkas accounts real import --name payer --address <kaspasim:sender> --network simnet --private-key-env PK --password-env PW
   hardkas tx send --from payer --to <kaspasim:recipient> --amount 10 --network simnet --password-env PW --yes
   hardkas tx wait <txId> --until confirmed --network simnet
   ```

- `tx send` plans, signs and sends in one step and prints the `Tx ID`.
- `tx wait` returns once the node's UTXO view reflects the transaction.

Use the four-step flow below instead when someone must review the plan before it is signed (a CI gate, another
signer), or when you want each step's artifact on disk.

## The four-step flow

This guide deeply explains the canonical four-step flow.

### 1. Planning (`tx plan`)
The Planner queries the active provider (simulated or real). The official `kaspa-wasm` Generator selects the UTXOs and calculates mass and network fees, and HardKAS commits the result into a `txPlan` JSON artifact. No private keys are needed here.

### 2. Inspection (`artifact inspect`)
Before you sign, you must trust what you are signing. This command decodes the deterministic payload so a human or automated CI gate can assert the destination address and amount.

### 3. Signing (`tx sign`)
The Signer requires the `txPlan` artifact and access to your keystore. It temporarily injects the private key into a WASM memory buffer, signs the Sighash, outputs a `signedTx` artifact, and destroys the key material in memory. 

### 4. Sending (`tx send`)
The Sender takes the `signedTx`, validates the lineage hash, and pushes the raw hex payload to the Kaspa network. It outputs a `receipt` artifact containing the final `txId`.
