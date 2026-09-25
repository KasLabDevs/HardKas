# The Recovery Model

When HardKAS enters a failed state, recovery must be executed surgically. 

> **The Operational Invariant:** No destructive recovery action (like deletion or reset) should ever be performed unless you can mathematically prove the state is either ephemeral, fully reproducible, or irrelevant.

## Rebuildable Projections (Safe to Reset)

The `Query Store` is a pure read-model projection indexing your artifacts. If the index corrupts or the schema changes:

**Safe Recovery:**
```bash
hardkas query reset
hardkas query rebuild
```
*What it does:* Flushes the local SQLite index and rebuilds it by parsing all files in `.hardkas/artifacts/`. Zero canonical data is lost.

## Node State Corruption (Moderate Risk)

If the local Docker node crashes, halts, or forks unexpectedly, and you do not care about the existing local UTXOs (e.g., in a CI environment):

**Safe Recovery:**
```bash
hardkas node stop
hardkas node reset
hardkas node start --profile toccata-v2
```
*What it does:* Destroys the local DAG data volume. 
*Data Lost:* All localnet balances, deployments, and unmined mempool transactions. 
*Data Kept:* Your artifacts and workspace config remain perfectly intact.

## Artifact Integrity Failure (High Risk)

If `hardkas artifact verify <file>` throws `INTEGRITY_FAILED`, it means the file's contents were mutated after creation.

**Recovery:**
* **Do NOT delete the file immediately.** It may contain the only copy of a signed transaction or `covenant_id`.
* Inspect the diff manually.
* If it is a deployment `plan.json` that was never submitted, it is safe to delete and re-run `hardkas tx plan`.
* If it is a `receipt.json`, verify the actual transaction on a block explorer using the `txid`, and reconstruct the receipt manually if necessary.

## Keystore / Account Loss (Irreversible)

If you lose or corrupt `.hardkas/accounts.real.json`:

**Recovery:**
* If you generated the accounts deterministically from a mnemonic seed phrase (or have it backed up), you can restore them via `hardkas accounts import`.
* If you generated random private keys and did not back them up: **The funds are permanently lost.** HardKAS cannot recover keys.

## Virtual State Instability

During heavy concurrent deployments, you might encounter UTXO planning failures where HardKAS attempts to use a UTXO that was just spent by another pending transaction.

**Recovery:**
* Wait for the pending transactions to clear the mempool (`hardkas tx wait`).
* Use explicit UTXO selection (`--utxo`) if automatic coin-selection repeatedly races itself.
