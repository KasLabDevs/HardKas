---
title: Plan, sign and send a transaction
description: Plan, sign, send and observe a Kaspa payment with the HardKAS CLI or SDK, on the simulated ledger or a simnet node, and what each step checks.
---

# Plan, sign and send a transaction

A payment in HardKAS is four steps, and each one writes an artifact the next step checks:
**plan → sign → send → observe**. The commands are the same on the simulated ledger and on a node; what each step
proves is not. [Transaction lifecycle](../../concepts/transaction-lifecycle.md) explains the model, and
[Your first transaction](../../start/first-transaction.md) what each step proves and does not prove.

## On the simulated ledger

No node and no Docker. `hardkas init` creates the accounts `alice`…`erin` with 1000 KAS each.

```bash
hardkas tx plan --from alice --to bob --amount 10 --network simulated --out plan.json
hardkas artifact inspect plan.json
hardkas artifact verify plan.json --strict
hardkas tx sign plan.json --account alice --out signed.json
hardkas tx send signed.json --network simulated --yes
hardkas explain <receipt-artifact-id>
```

`tx send` prints the receipt's `artifactId` (for `explain` and `why`) and the transaction id separately.

## On a simnet node

A real `rusty-kaspad` node in Docker, funded by mining. The accounts below get random keys in encrypted keystores
([Accounts](../accounts.md)).

```bash
export PW=<keystore password>
hardkas localnet start --toccata
hardkas accounts real generate --name miner --network simnet --password-env PW
hardkas accounts real generate --name ana --network simnet --password-env PW
hardkas localnet fund miner
hardkas tx plan --from miner --to ana --amount 10 --network simnet --out plan.json
hardkas tx sign plan.json --account miner --password-env PW --out signed.json
hardkas tx send signed.json --network simnet --wait
hardkas tx status <txId>
hardkas accounts balance ana --network simnet
```

## 1. Plan

`hardkas tx plan` (SDK: `sdk.tx.plan()`) builds the transaction without signing it.

- **Amount.** `--amount <kas>` is KAS, up to 8 decimals (1 KAS = 100,000,000 sompi). To pay several recipients in one
  transaction, repeat `--to <recipient>=<kas>` and leave out `--amount`.
- **Change.** `--change <account-or-address>` sends the change elsewhere; without it the change returns to the sender.
  The change destination is resolved and checked like the recipient: an address of another network is refused
  (`ACCOUNT_NETWORK_MISMATCH`).
- **Fee.** `--fee-rate` and `--max-fee`; see [Fees, mass and UTXOs](./fees-and-mass.md). `hardkas tx profile plan.json`
  shows the plan's mass and fee breakdown.

The pinned `kaspa-wasm` Generator selects the inputs, computes mass and fee and makes the change; HardKAS adds no
selection policy of its own. It refuses what one plan cannot represent:

| Condition | Error |
|-----------|-------|
| No spendable output is left after the filters below | `NO_SPENDABLE_UTXOS` |
| The inputs needed do not fit in one standard transaction | `MULTI_TRANSACTION_PLAN_REQUIRED` |
| The change is too small for a standard output (storage mass, KIP-9) | `CHANGE_BELOW_STANDARD_OUTPUT` |
| A payment output is too small for a standard output | `OUTPUT_BELOW_STANDARD_AMOUNT` |
| The fee is above the limit in force | `FEE_EXCEEDS_MAX` |

**On the simulated ledger** the outputs come from `.hardkas/localnet.json` (synthetic UTXOs), the fee rate defaults
to 1 (the transaction pays the relay minimum) and the plan records `plannerAuthority: "SYNTHETIC_SIMULATOR"`:
non-authoritative, no node validates what the simulator executes.

**On a node** the plan records `plannerAuthority: "KASPA_WASM_GENERATOR"`, the fee rate is the node's estimate unless
you pass `--fee-rate`, and the CLI wraps the Generator in three checks:

1. **Maturity.** A coinbase output is spendable only after the network's coinbase maturity plus a HardKAS margin of
   10 DAA.
2. **Pending spends.** Outputs a transaction in the node's mempool is already spending are left out, from one mempool
   observation taken with the UTXO read. All of them pending: `PENDING_SPEND_ALL_EXCLUDED`; no mempool answer:
   `PENDING_SPEND_EVIDENCE_UNAVAILABLE` (it never plans blind).
3. **Selected-input re-check.** At the end of each attempt the CLI re-reads the node: every selected input must still
   be in the address's UTXO set and must not be spent by a mempool transaction. Otherwise it plans again; after the
   bounded retries, `SELECTED_UTXO_INVALIDATED`. Blocks arriving meanwhile never invalidate a plan: the virtual state
   before and after is recorded in `metadata.planningWindow` as evidence only.

These checks are local to the node that was read: a competing spend elsewhere on the network can still appear before
the send, and the node then refuses the transaction. `tx send --preflight` checks the inputs again right before the
broadcast.

`plannerAuthority` is provenance, not a security rating or a consensus guarantee. An older plan may lack it.

## 2. Inspect before signing

When automation produced the plan, look at it before a key signs it:

```bash
hardkas artifact inspect plan.json
hardkas artifact verify plan.json --strict
```

`inspect` shows the recipients, amounts and fee; `verify` recomputes the content hash. A plan edited by hand (another
amount, address or network) no longer hashes to its content hash: `verify` fails and `tx sign` refuses it
(`ARTIFACT_HASH_MISMATCH`). Plan again instead of editing.

## 3. Sign

```bash
hardkas tx sign plan.json --account <name> --out signed.json
```

`--account` must hold the key that controls the plan's inputs. What happens depends on the account:

- **Simulator account** (`kind: "synthetic"`): HardKAS writes a synthetic authorization by the plan's sender. No
  Kaspa signature is produced.
- **Encrypted keystore** (`kind: "kaspa"`): the password comes from `--password-env <VAR>`, `--password-stdin` or a
  prompt on a terminal; the key signs every input (Schnorr, or ECDSA for an account made with `--ecdsa`). The simnet
  development accounts `alice`…`erin` open with their published development password, so they need none.
- **Plaintext key** (`--unsafe-plaintext`): signs directly. Local nodes only.
- **An address only** (`kind: "external-wallet"`): HardKAS knows the address but holds no key, so it cannot sign.
  This build cannot export a PSKT; an external key signs outside HardKAS, or through a browser wallet
  (experimental, see [Browser wallets](../../start/browser-wallets.md)). A transaction signed outside HardKAS is
  sent with `tx send --allow-unplanned` (without it: `SEND_PLAN_UNRESOLVED`).

`tx sign` also checks the plan's fee against its fee limit again (`FEE_EXCEEDS_MAX`), and signs nothing on mainnet
(`MAINNET_SIGNING_DISABLED`). `--threshold` is a synthetic multisig for tests: it produces no Kaspa multisig script.

The signed artifact's `lineage.parentArtifactId` is the plan's `artifactId`. It proves authorization of exactly that
plan, not that a node will accept it.

## 4. Send

```bash
hardkas tx send signed.json --network <name>
```

- **Simulated ledger:** HardKAS applies the transaction to `.hardkas/localnet.json` and writes a `TxReceipt`.
- **Node:** HardKAS broadcasts it and writes a `TxSubmission` (`hardkas.txSubmission.v1`) with the node's answer and
  the Kaspa `txId`. Both go under `.hardkas/artifacts/receipts/`.

Rules that hold on every network:

- `--network` and `--target` must match the artifact; they never redirect it (`EXECUTION_NETWORK_MISMATCH`,
  `EXECUTION_TARGET_MISMATCH`).
- On a network other than `simulated` and `simnet`, `--yes` is required: without it nothing is sent
  (`TX_SEND_CONFIRMATION_REQUIRED`, exit 3).
- Mainnet is refused before anything connects (`MAINNET_BROADCAST_DISABLED`).
- Sending the same signed transaction again sends nothing (`--json` reports `ALREADY_SUBMITTED`).

A receipt proves that the simulator applied the transaction, or that the node accepted the submit request. It does
not prove that the transaction is accepted by the DAG, confirmed or final.

## 5. Observe (node only)

```bash
hardkas tx wait <txId> --until confirmed --timeout 300
hardkas tx status <txId>
hardkas explain --tx <txId>
hardkas artifact verify signed.json --network simnet --require consensus
```

- `tx send --wait` waits right after the send until the transaction is `CONFIRMED` on the same node
  (`--wait-timeout`, default 60 s). Not reaching it in time is `TX_SEND_WAIT_FAILED`: the transaction was still
  submitted.
- `tx wait` returns at `ACCEPTED` or `CONFIRMED` (`--until`), then waits until the node's UTXO view reflects the
  transaction, so the balance you read next is current.
- `tx status` shows the state derived from the recorded observations plus one new look (`--no-observe` takes none).
- `explain --tx <txId>` resolves the submission recorded for that txId. A bare txId is not an artifact locator:
  `hardkas explain <txId>` is refused (`NAMESPACE_REQUIRED`).

`CONFIRMED` means 100 blue-score confirmations on that node, a HardKAS policy, not a Kaspa parameter. See
[Reading receipts and verification levels](../../start/receipts-and-levels.md).

## From the SDK

The same steps on the simulated ledger. The SDK's `amount` is KAS when it is a string (`"10"`) and sompi when it is a
`bigint`.

```ts
import { Hardkas } from "@hardkas/sdk";

async function main() {
  const sdk = await Hardkas.open({ network: "simulated" });
  try {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const signed = await sdk.tx.sign(plan, { account: "alice" });
    const { receipt } = await sdk.tx.simulate(signed);
    console.log("receipt txId:", receipt.txId);
  } finally {
    await sdk.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

On a node, open the instance on that network (`Hardkas.open({ network: "simnet" })`), send with `sdk.tx.send(signed)`
(it returns `{ receipt, submission }`; `receipt` is the `TxSubmission`), then read the state with
`sdk.tx.status(txId)` or wait with `sdk.tx.waitForConfirmations({ txId, minConfirmations })`. A signing password goes
in `sdk.tx.sign(plan, { account, keystorePassword })`.

## Pitfalls

- **Mixing networks.** A plan made for `simulated` cannot be sent on `simnet`, nor the reverse: plan again on the
  network you mean. A simulator identity (`kaspa:sim_<name>`) is refused on a node (`ACCOUNT_NETWORK_MISMATCH`).
- **Editing artifacts.** Never edit a plan, a signed transaction or a receipt by hand; regenerate it from the previous
  valid step.
- **Treating the receipt as confirmation.** On a node, `tx send` returns at `SUBMITTED`. Wait with `--wait` or
  `tx wait`.
- **Fragmented wallets.** An account holding many small outputs can hit `MULTI_TRANSACTION_PLAN_REQUIRED`. Consolidate
  first: `hardkas accounts consolidate <account> --network simnet --dry-run`, then `--execute --yes`.
- **Wrong signer.** HardKAS signs only with a key it holds for the plan's inputs; an address-only account cannot sign.

<!-- qualification: transaction-planning -->
