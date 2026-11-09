[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SubmitOutcome

# Type Alias: SubmitOutcome

> **SubmitOutcome** = `"accepted"` \| `"rejected"` \| `"unknown"`

Defined in: [packages/artifacts/src/tx-status.ts:132](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L132)

EVENT-LEDGER-2 closeout · what the recorded result of ONE submit call establishes, and nothing more (never a
consensus state):
 - `accepted`: the responding node accepted the submission request — not acceptance or confirmation in the DAG;
 - `rejected`: the node answered and refused it: an answer with `accepted: false`, or the node's own rejection, which
   arrives as "Rejected transaction \<txId\>: \<reason\>" (rusty-kaspa's RejectedTransaction RPC error);
 - `unknown`: the call failed without such an answer (a timeout, a lost connection, …): whether the node received the
   transaction is not known, so it is never reported as a rejection. P0-TX-SAFETY-1A: so is an answer in which the node
   says it ALREADY HOLDS this transaction (rusty-kaspa wraps those mempool rules in the same "Rejected transaction"
   error): it neither rejects nor accepts the payment — its state is decided by observation, and it never invites
   planning and signing the payment again.
