# Error Recovery And Diagnostics

HardKas should fail early when a command crosses a local safety boundary. This page lists the errors that matter most for the local-first alpha workflow.

## `NETWORK_ADDRESS_MISMATCH`

Meaning:
A transaction artifact, address, or provider belongs to a different Kaspa network context than the command is trying to use.

Common cause:
You planned a transaction for `simulated`, `simnet`, or `testnet-10`, then tried to send it through a different provider or node.

Example:

```bash
hardkas tx send testnet-signed.json \
  --network mainnet \
  --provider rpc \
  --url ws://mainnet-node.example:16110
```

Resolution:
Check the artifact's `networkId`, the selected provider, and the node URL. Re-run `hardkas tx plan` for the intended network instead of editing the artifact by hand.

## `INVALID_PRIVATE_KEY_MATERIAL`

Meaning:
The signer received key material that cannot be parsed as a valid Kaspa private key or seed.

Common cause:
A script passed a password, malformed hex string, or serialized object where primitive key material was expected.

Resolution:
Audit the keystore path and signer input. Do not pass raw WASM objects or arbitrary strings into the signer.

## `CORRUPTED_PRIVATE_KEY_SERIALIZATION`

Meaning:
Key material crossed an execution boundary as a runtime object, usually with a WASM pointer such as `__wbg_ptr`, instead of portable data.

Resolution:
Never serialize raw Kaspa WASM classes. Export encrypted keystore JSON or primitive key data, then recreate runtime key objects inside the signing process.

## `TOO_MANY_INPUTS_FOR_SINGLE_TX`

Meaning:
The planner would need more UTXOs than the transaction mass limit allows.

Common cause:
A mining or test wallet has many small UTXOs and tries to send a large amount in one transaction.

Resolution:
Use the consolidation workflow before sending:

```bash
hardkas accounts consolidate --execute --yes
```

## `DEV_ACCOUNT_KEY_UNAVAILABLE`

Meaning:
HardKas tried to sign for a simulated account, but the local workspace does not contain the matching dev key data.

Resolution:
Initialize or repair the local workspace:

```bash
hardkas init
hardkas dev doctor
```

## `MALFORMED_ARTIFACT`

Meaning:
An artifact is missing required fields or its canonical content no longer matches its stored identity.

Common cause:
The JSON file was manually edited after creation.

Resolution:
Discard the artifact and regenerate it from the previous valid step:

```bash
hardkas tx plan --from alice --to bob --amount 1 --network simulated --out plan.json
hardkas tx sign plan.json --account alice --out signed.json
```

## WASM Memory Access Out Of Bounds

Symptom:
Node.js or a browser process crashes with a WebAssembly memory error during signing.

Likely cause:
A raw Kaspa WASM object was passed between processes, threads, or browser/Node boundaries.

Resolution:
Only pass portable data across boundaries. Browser apps should use `@hardkas/client` or `@hardkas/react` against the dev server instead of importing the Node SDK directly.
