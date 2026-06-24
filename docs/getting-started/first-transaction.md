# Your First Transaction

This guide deeply explains the canonical four-step flow.

### 1. Planning (`tx plan`)
The Planner queries the active provider (simulated or real). It performs largest-first UTXO selection, calculates standard network fees, and commits this into a `txPlan` JSON artifact. No private keys are needed here.

### 2. Inspection (`artifact inspect`)
Before you sign, you must trust what you are signing. This command decodes the deterministic payload so a human or automated CI gate can assert the destination address and amount.

### 3. Signing (`tx sign`)
The Signer requires the `txPlan` artifact and access to your keystore. It temporarily injects the private key into a WASM memory buffer, signs the Sighash, outputs a `signedTx` artifact, and destroys the key material in memory. 

### 4. Sending (`tx send`)
The Sender takes the `signedTx`, validates the lineage hash, and pushes the raw hex payload to the Kaspa network. It outputs a `receipt` artifact containing the final `txId`.
