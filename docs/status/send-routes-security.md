# Send routes: what each one checks before a broadcast

HardKAS has several public ways to put a transaction on a Kaspa L1 network. They do not all check the same things before the broadcast. This page lists them side by side.

Two rules hold for every route:

- **Mainnet transactions are refused.** Right before each broadcast, the node is asked which network it serves (MAINNET-PERIMETER-1), whichever client is used.
- **The node has the last word.** Local checks narrow what can go wrong. None of them stands in for the node's own script execution. HardKAS records what the node answered.

## The routes

| Route | Signed tx is the plan's | Sent under its txid | Node's network | Inputs at the node, right before sending | Signatures verified locally | Unknown outcome | Evidence |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| **Payment**, default.<br>SDK `tx.send`. CLI `hardkas tx send` (signed artifact or `--from/--to/--amount`), `hardkas tx batch`, `hardkas accounts consolidate`. Dev-server dApp send. | yes (SIGNED_PLAN_MISMATCH) | yes (EXPECTED-TXID-1) | yes (NODE-NETWORK-IDENTITY-1) | no; done earlier, at plan and sign time (see note 1) | no; the node verifies them | recorded once, never sent again (TX-SEND-IDEMPOTENT-1) | `hardkas.txSubmission.v1` |
| **Payment with the preflight**.<br>SDK `tx.send(signed, { preflight: true })`. CLI `hardkas tx send --preflight`. | yes | yes | yes | **yes**: unspent at the plan's address, amount and script as planned, no covenant id, not pending in its mempool | **yes**: BIP340, SIGHASH_ALL, Schnorr P2PK only (see note 2) | recorded once, never sent again | the same, plus `preflight` |
| **v1 engine transaction** (covenants, Silver through the engine).<br>`hardkas silver covenant genesis`, `hardkas silver covenant transition`. `hardkas silver deploy` and `hardkas silver spend` with `--tx-version 1`. `hardkas silver engine`. SDK `covenants.send`. | yes, field by field (budgets, bindings, storage mass, payload) and the whole txid | yes | yes | **yes, always** (F1.6): unspent, unchanged, not pending, a P2PK input without covenant id | shape only (one SIGHASH_ALL signature per slot). Drafts verify every signature at combine and finalize. | recorded once; a second transition of the same covenant waits unless explicitly replaced | `hardkas.txSubmission.v1` with `covenantSpends` and `preflight` |
| **Silver v0**.<br>`hardkas silver deploy` and `hardkas silver spend`, the default. | no plan: the command builds the transaction | checked on the node's answer only | yes: the canonical localnet proves its identity before the command runs (its client then declares no network) | no; covenant UTXOs and immature coinbases are left out when choosing coins | no | SILVER_SUBMIT_OUTCOME_UNKNOWN naming the txid, never "rejected"; not sent again | the command's own records |
| **Dev-server escrow** (`/api/escrows`, after ESCROW-SAFETY-2) | no plan: v0 P2SH funding and spend drafts | yes | yes, simnet required | funding: covenant UTXOs, immature coinbases and mempool pending spends left out. Release: the recorded funding output, not read again. | **yes**: every required signature, by the key the escrow names for the role, before the release is sent | recorded with its txid; no second funding or release before `reconcile` | in-memory records only (lost on restart) |
| **Toolkit wallet**.<br>`WalletToolkit.signAndBroadcast`. | no (an inline plan) | no | yes: a declared network is required and read before planning, signing and sending | no | no | WALLET_SUBMIT_OUTCOME_UNKNOWN naming the txid; not sent again | none |

## Notes

1. **Before the default payment send**, the inputs are checked twice, earlier in the flow:
   - At plan time, against the node's UTXOs and mempool. Covenant UTXOs are left out, and so are outpoints a mempool transaction is spending.
   - At sign time, `tx.sign` asks the node about each input. It refuses a covenant UTXO, or an input the node does not list.

   A signed artifact that was made elsewhere, or that sat waiting, is not checked again before the default send. The preflight closes that gap, and only when the caller asks for it.
2. **What the preflight verifies, and how far it goes.**
   - It rebuilds the transaction exactly as the client sends it (official kaspa-wasm), with the node's UTXO entries. It verifies each signature against those entries.
   - Anything it cannot verify refuses the send: a P2SH or ECDSA input, another sighash type, another unlock form.
   - It is one node's view at one instant (scope `observer-local`). An outpoint missing from that node's mempool may still be spent elsewhere on the network.
   - It is not available on the simulator, and not for v1 engine transactions, which run their own check.
3. **"Recorded once, never sent again"** applies to an outcome HardKAS cannot know: a timeout, a lost connection, an "already in the mempool" answer. The transaction is observed (`hardkas tx status`, `hardkas tx wait`), not sent again. A request that never left the process is not a submission, and can be sent.
4. **The dev-server escrow** is a local simnet tool.
   - Its records live in memory: nothing is written to the workspace, and nothing is migrated.
   - "confirmed" means a chain block of the node accepted the transaction, as the SDK's observer reads it from the virtual chain. The node has no transaction lookup by id.

L2 (Igra) sends are not covered here.
