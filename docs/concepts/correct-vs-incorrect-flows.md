# Correct vs Incorrect Execution Flows

HardKAS enforces strict boundaries. A transaction must travel through a specific set of states (the "correct flow") to be valid. Deviating from this flow—either by skipping steps or mixing context—will cause HardKAS to abort deterministically.

## The Correct Canonical Flow

### `plan` → `sign` → `send`

This is the only valid sequence for transaction construction. 

1. **`tx plan`**: Contacts the node, selects UTXOs, handles fee calculation, and builds a deterministic `txPlan` artifact.
2. **`tx sign`**: Reads the `txPlan`, instantiates the keys, calculates the sighash, and outputs a `signedTx` artifact that links back to the plan.
3. **`tx send` (or `simulate`)**: Reads the `signedTx`, optionally validates it, and broadcasts the raw hex to the RPC layer, outputting a `receipt`.

Each stage relies *only* on the artifact produced by the previous stage. The signer does not contact the node; the sender does not touch private keys.

---

## Incorrect Flow: Signing without Verifying

**What is happening?**
A user generates a plan, maybe hands it off to an automated system, and immediately pipes it to the signer without inspecting what is inside.

**Why is this dangerous?**
The signer blindly signs the exact outputs listed in the plan. If the plan was intercepted and mutated (e.g., a man-in-the-middle changed the `to.address` to a hacker's address), the signer will legally authorize the theft.

**What does HardKAS do?**
HardKAS provides `artifact inspect` and `artifact verify`. The *correct* flow mandates a human or automated CI gate to call `artifact verify` to ensure the file hash is intact, and `artifact inspect` to visually assert the destination address, *before* running `tx sign`.

---

## Incorrect Flow: Mixing Networks

**What is happening?**
A user creates a `txPlan` while configured for `simulated` or `testnet-10`, signs it, and then attempts to broadcast it to a `mainnet` Kaspa node.

**Why is this dangerous?**
The node might reject it due to UTXO mismatch, but if by sheer coincidence a valid UTXO exists, it could broadcast an unintended transaction.

**What does HardKAS do?**
The network context is permanently serialized into the `txPlan`. The `submitTransaction` function strictly checks the artifact's `networkId` against the active Provider's network configuration. If there is a mismatch, HardKAS aborts with a `NETWORK_ADDRESS_MISMATCH` error *before* the RPC request is made.

---

## Incorrect Flow: Using an Incorrect Provider

**What is happening?**
A developer writes an app using `@hardkas/sdk`, generates a real transaction plan with live UTXOs, but attempts to execute it via a `SimulatedProvider`.

**Why is this dangerous?**
It isn't strictly dangerous (funds won't be lost on simulation), but it leads to completely invalid state assumptions. The client assumes the transaction is settled, but it only settled inside the isolated `.hardkas/localnet.json` file.

**What does HardKAS do?**
The `tx.simulate` method enforces that the artifact must contain `mode: simulated`. If a `real` artifact enters the simulation pipeline, it throws an error.

---

## Incorrect Flow: Mutating Artifacts Mid-Flight

**What is happening?**
A user or process attempts to manually edit a `signedTx` file to change the `amountSompi` before sending it to the network.

**Why is this dangerous?**
The signature was generated over the original payload. If the payload changes, the signature becomes invalid and the Kaspa Node will reject it.

**What does HardKAS do?**
The `tx send` step invokes the lineage builder. It checks the cryptographic hash of the JSON contents against the ID string. Because the `amountSompi` was changed, the file's SHA-256 hash no longer matches the artifact ID. HardKAS immediately halts execution with a `[MALFORMED_ARTIFACT]` error, preventing the invalid payload from consuming network resources.

---

## Incorrect Flow: Raw Consumption of Too Many UTXOs

**What is happening?**
A user operates a mining wallet with 50,000 UTXOs. They try to send 10 KAS to a friend using a standard transaction command. The command attempts to load all 50,000 UTXOs into memory.

**Why is this dangerous?**
Fetching, deserializing, and passing 50,000 UTXOs to the WASM runtime will cause a V8 Out-Of-Memory (OOM) crash. Furthermore, Kaspa transactions have strict mass limits (typically ~100 KB). A single transaction cannot hold thousands of inputs.

**What does HardKAS do?**
The planner implements deterministic input selection. It queries UTXOs from the node and sorts them (largest-first). It only selects the absolute minimum number of inputs required to satisfy the transaction amount plus fees. If the transaction requires more inputs than the Kaspa maximum mass allows, it aborts cleanly with `TOO_MANY_INPUTS_FOR_SINGLE_TX`.

**Resolution:** The user must use the `accounts consolidate` workflow, which iteratively bundles small dust UTXOs into large blocks in batches, keeping memory limits and mass limits fully respected.
