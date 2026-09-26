# Security Failure Modes

Operational mistakes in HardKAS can lead to permanent financial loss or severe privacy leaks. Review these failure modes carefully.

## 1. Key Exposure (`--unsafe-plaintext`)

* **The Trap:** When running `hardkas accounts real generate`, a developer might append `--unsafe-plaintext` to bypass keystore passwords for faster testing.
* **The Failure:** The raw Kaspa private key is written in plain text to `.hardkas/accounts.real.json`. Any malicious script, accidental git commit, or compromised dependency can immediately sweep the funds.
* **The Rule:** Only use `--unsafe-plaintext` for disposable CI/Localnet identities. Never use it for Testnet or Mainnet.

## 2. Network Mismatch

* **The Trap:** Attempting to submit a transaction built for `simnet` to a `mainnet` RPC node.
* **The Failure:** HardKAS strict resolution prevents this internally (`ACCOUNT_NETWORK_MISMATCH`), but if you extract a raw transaction payload and manually submit it to a misconfigured node, you risk cross-network contamination or immediate rejection.
* **The Rule:** Always bind your workspace `kaspa.network` config to the intended target and rely on HardKAS to enforce the boundaries.

## 3. Manipulated PSKT

* **The Trap:** You receive a PSKT file (`session.pskt`) from a Coordinator and sign it immediately using `hardkas pskt sign`.
* **The Failure:** The Coordinator maliciously altered the outputs. Your signature authorizes the transfer of funds to the attacker instead of the intended recipient.
* **The Rule:** Always run `hardkas pskt inspect` to independently verify the amounts and recipients *before* signing.

## 4. Wrong Workspace Context

* **The Trap:** You have multiple terminal tabs open in different HardKAS workspaces (e.g., `proj-local` and `proj-testnet`). You execute `hardkas tx send` in the wrong tab.
* **The Failure:** You deploy a testing payload to the wrong network, potentially burning real KAS on fees or polluting the deployment index.
* **The Rule:** Always verify the active workspace via `hardkas env` before executing state-mutating commands.

## 5. Artifact Provenance Loss

* **The Trap:** You delete `.hardkas/artifacts/` to "clean up" the directory, assuming the node has the data.
* **The Failure:** While the transaction is safe on the blockchain, you lose the cryptographic link between your source code (e.g., SilverScript `.sil` files) and the deployed `covenant_id`. It becomes extremely difficult to prove to auditors or users that the L1 covenant corresponds to your source code.
* **The Rule:** Artifacts are evidence. Treat the `.hardkas/artifacts/` directory as critical production data and back it up.
