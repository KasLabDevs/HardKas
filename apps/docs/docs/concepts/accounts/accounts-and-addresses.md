# The HardKAS Account Ontology

To build safely on Kaspa with HardKAS, you must abandon assumptions from EVM networks or traditional web2 accounts. Identity, network eligibility, and cryptographic authority are strictly separated concepts.

This page destroys the most dangerous false myths in the framework.

## False Myths to Destroy

* ❌ **Myth:** Account = Address
* ❌ **Myth:** Address = Private Key
* ❌ **Myth:** Wallet = Account
* ❌ **Myth:** Synthetic Account = Real Node Account
* ❌ **Myth:** External Wallet = HardKAS holds its key

## The Canonical Ontology

### 1. Address
**What it is:** A base58-encoded string (or equivalent format) representing a public key hash or script hash (e.g., `kaspasim:qr...`). 
**What it is NOT:** An Address is **not** a Private Key. HardKAS can know an address without possessing the ability to sign for it.
**Environment:** Network-specific (prefixes enforce network boundaries: `kaspa:`, `kaspatest:`, `kaspasim:`).

### 2. Private Key
**What it is:** The raw cryptographic entropy (usually 64 hex characters) required to authorize spending from a matching Kaspa Address via Schnorr/ECDSA signatures.
**Where it lives:** Encrypted in `.hardkas/keystore/`, generated temporarily in memory, or held entirely outside HardKAS by an external signer/hardware wallet.
**Who owns it:** The Signer.

### 3. Account (Identity Context)
**What it is:** A named configuration block (e.g., `"alice"`) resolved by HardKAS to determine *how* to interact with an identity in a specific environment. 
**What it is NOT:** An account name is **not** a globally unique blockchain identity. The name "alice" resolves differently depending on whether you are running against the Simulator or Localnet.
**Kinds:**
* `kaspa`: A real cryptographic account. HardKAS has access to its keystore or private key.
* `synthetic`: A Simulator-only virtual identity (e.g., `kaspa:sim_alice`). Uses no real cryptography.
* `external-wallet`: HardKAS knows the address for planning/funding, but **does not** hold the key. Signing must be delegated or exported via PSKT.

### 4. Wallet
**What it is:** A higher-level orchestration abstraction (found in `@hardkas/toolkit` and `sdk.wallet`).
**What it is NOT:** A Wallet is not an Account. An Account is an *identity* and a *signing capability*. A Wallet is a *stateful manager* that tracks balances, aggregates UTXOs, and coordinates multi-step payments over time.

---

## Account Resolution 

When you run `hardkas tx plan --from alice`, what actually happens?

1. The HardKAS **Resolver** checks the current *Execution Target* (Simulator vs Localnet).
2. It looks up the alias `"alice"` in the target context.
3. If running in Simulator, it returns the `SyntheticAccount` mapped to `kaspa:sim_alice`.
4. If running in Localnet, it returns the `RealDevAccount` generated for `"alice"`, unlocking its keystore if permitted.
5. It yields an **Address** (to query UTXOs) and a **Signer Capability** (to authorize inputs later).

This contextual resolution allows your code and policies to remain identical whether you are running a 5-second simulated test or a live Mainnet execution.
