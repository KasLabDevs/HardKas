# Predicted Friction Points

- Consecutive `tx.plan` calls without `query.sync()` in between might cause a UTXO double-spend error if the localnet UTXO cache doesn't track pending outputs, or if `tx.simulate` doesn't immediately update the mempool state.
- In simulated mode, `tx.simulate` is supposed to broadcast and confirm immediately, but does the query store see it instantly, or do we need `query.sync()` to update UTXOs? If `tx.plan` relies on the query store, it might fail to find funds for the 2nd transaction.
