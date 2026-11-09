# Proposal: absolute time locks (CLTV) and spends from ECDSA addresses

Status: **proposal for the next cycle, not implemented**. Version 1, 2026-11-09 (RC1 · D7).
Nothing in this release builds, signs or sends either of them; this page says what would have to be true first.

## What this release does

- **Lock time.** Every transaction HardKAS builds has lock time 0 (tx-builder, the accounts signer, the v1 engine).
  Asking for another one is refused with a typed code: `tx.plan({ lockTime })` → `LOCK_TIME_NOT_SUPPORTED`; the CLI
  has no lock-time option (`UNKNOWN_OPTION`); the signer refuses a plan that states another lock time
  (`LOCK_TIME_NOT_SUPPORTED`); a signed payment bound to its plan whose payload carries another lock time is
  `SIGNED_PLAN_MISMATCH` at send. A transaction signed elsewhere and sent with `allowUnplannedSignedTransaction`
  goes to the node as it is: HardKAS does not evaluate lock times.
- **ECDSA.** The accounts signer signs Schnorr P2PK only. Paying to an ECDSA address works (checked against
  rusty-kaspad v2.1.0, `construction-vectors-node.simnet` V-04). A spend from one is refused when it is planned
  (`tx.plan`, `hardkas tx plan`, consolidations) and when it is signed: `ECDSA_SPEND_NOT_SUPPORTED`, before any UTXO
  is read or any key is used. An unlocking script the caller makes itself (a signature-script authorization) is used
  as given; HardKAS signs nothing for it.
- Tests of the refusals: `packages/tx-builder/test/ecdsa-spend-unsupported-rc1-d7.test.ts`,
  `packages/accounts/test/unsupported-ecdsa-cltv-rc1-d7.test.ts`, `packages/sdk/test/unsupported-cltv-ecdsa-rc1-d7.sdk.test.ts`,
  `packages/cli/test/unsupported-cltv-ecdsa-rc1-d7.test.ts`.

## Part A · absolute time locks

### Kaspa semantics to build on (to be confirmed against rusty-kaspad v2.1.0 before any code)

- A transaction's `lockTime` is a u64. Below the lock-time threshold (500 000 000 000) it is a DAA score; at or above
  it, a time in milliseconds compared with the past median time. Lock time 0 means final.
- A transaction with a lock time not reached yet is not final and is refused, unless every input's sequence is the
  maximum value (the lock time is then ignored). HardKAS sets sequence 0 on every input (TX-SEQUENCE-1), and stated
  sequences only for relative locks.
- `OpCheckLockTimeVerify` in a script compares the spending transaction's lock time with a value on the stack, of the
  same kind (DAA score or time), and fails for an input whose sequence is the maximum. A contract that uses it can
  only be spent by a transaction whose lock time is set accordingly.
- The lock time is covered by the transaction id and by the signature hash (`packages/core/src/kaspa-sighash.ts`).

### Design

1. **Plan field.** An optional `lockTime` on the plan, given as a typed value, never a bare number:
   `{ daaScore: bigint }` or `{ timestampMs: bigint }`, checked against the threshold (a DAA score at or above it, or a
   time below it, is refused). Absent means 0 and is not written, so every existing plan, its content hash and every
   v0 signed record stay exactly as they are.
2. **Planner.** `tx.plan({ lockTime })` and `hardkas tx plan --lock-time-daa <n> | --lock-time-ms <t>` (one of them).
   The plan records the node's virtual DAA score and past median time it was made at, so a far-off lock is visible.
3. **Signer.** Writes the plan's lock time into the transaction (v0 and v1); refuses one that disagrees with the plan.
   A plan with a lock time and an input with the maximum sequence is refused (the lock would be void).
4. **Send.** Before the broadcast, read-only, the node's virtual DAA score (or past median time) is compared with the
   lock: not reached → `LOCK_TIME_NOT_REACHED`, nothing sent or recorded (the node would refuse it; it never holds a
   non-final transaction to send later). `tx wait` is unchanged.
5. **v1 engine.** A contract input whose unlock runs `OpCheckLockTimeVerify` takes the plan's lock time; the engine
   checks the kind (DAA score or time) against the contract's constructor argument before signing.

### Risks

- Funds locked far longer than meant: a DAA score taken for a time (or the reverse), or a lock computed on another
  network's DAA rate. The typed value and the recorded virtual DAA score are the guard; a confirmation step in the CLI
  for any lock more than a day away is worth it.
- A plan made long before its lock time: its inputs may be spent by then; the send preflight must read them again.
- Artifact compatibility: the field must stay absent for lock time 0, or every certified v0 record changes.
- The simulator implements its own lock-time rule (frozen, UNVERIFIED); only the node counts as evidence.

### Evidence needed before it ships (rusty-kaspad v2.1.0, simnet, harness)

- DAA-score lock: one below the node's DAA score accepted and mined; equal and one above refused (not final), with the
  node's words; the same transaction accepted once the DAA score passes it.
- Time lock: the same three cases against the past median time.
- Every input at the maximum sequence: the lock time ignored (accepted early).
- `OpCheckLockTimeVerify` contract: lock time below the script value refused, equal and above accepted; kind
  mismatch refused; an input at the maximum sequence refused.
- txid and signature change with the lock time; the plan → sign → send path pins them (as the v0 vectors of D1).
- testnet-10: one read-only check of the node's answer for a non-final transaction, only with the owner's GO; never
  mainnet.

## Part B · spends from ECDSA addresses

### Kaspa semantics to build on (to be confirmed)

- P2PK ECDSA script: `21 <33-byte compressed key> ab` (OP_CHECKSIGECDSA), address version 1.
- The signature script pushes a 64-byte compact ECDSA signature plus the sighash type (65 bytes, like Schnorr), over
  the ECDSA variant of the signature hash. Whether the pinned kaspa-wasm 2.1.0 exposes an ECDSA input signer has to be
  checked first; if it does not, a signer from an audited secp256k1 library (RFC 6979 nonces, low-S) cross-checked
  against rusty-kaspa's own test vectors.

### Design

1. **Accounts.** A key scheme on each account (`schnorr` | `ecdsa`), recorded next to its address; the address derived
   by that scheme; `accounts real import --address <ECDSA address>` requires `--scheme ecdsa` explicitly. The same key
   yields two addresses (one per scheme): the account names the one it owns.
2. **Planner.** Plans from an ECDSA account; mass and fee priced with the ECDSA signature script (to be compared with
   the node's minimum, one sompi below refused).
3. **Signer.** The scheme of each input is decided by the UTXO's script, never by an address string; a key of the
   other scheme is refused; mixed inputs each get their own scheme.
4. **Preflight.** Verifies ECDSA signatures locally against the node's UTXO entries (it refuses them today).
5. PSKT, multisig and P2SH-wrapped ECDSA stay out of scope.

### Risks

- Key reuse across schemes: funds sent to the ECDSA address of a Schnorr account (or the reverse) look lost to a
  wallet that derives one scheme only. The account's recorded scheme and its address must agree, typed.
- Signature malleability and nonce generation: deterministic nonces and low-S only, tested.
- External wallets: whether they sign ECDSA Kaspa inputs is not known; no claim of compatibility without evidence.

### Evidence needed before it ships (rusty-kaspad v2.1.0, simnet, harness)

- An ECDSA spend planned, signed and sent by HardKAS, accepted and mined, with the exact value at the recipient.
- The same signature one byte off refused; a Schnorr signature on the ECDSA input refused (today's refusal, by the node);
  a high-S signature refused (or accepted: whatever the node says is the rule).
- Fee at the node's minimum, one sompi less refused; mixed Schnorr + ECDSA inputs accepted.
- The preflight's verdict equals the node's on each of those.

## Rollout

- Each part lands behind its own tests, unit first, then the simnet vectors above, in `construction-vectors-node.simnet`
  style (HardKAS's own construction judged by the node). No simulator verdict counts.
- `docs/status/limitations.md` and `docs/status/tx-version-compatibility.md` change only with that evidence.
- Mainnet stays blocked until the product's mainnet criteria are met, whatever this proposal enables.
