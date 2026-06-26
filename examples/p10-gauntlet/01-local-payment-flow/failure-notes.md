# Predicted Friction Points

- Alice might not be auto-funded when SDK starts.
- `tx.simulate` might require `tx.send` to actually write to the query store, or maybe `simulate` writes artifacts but doesn't change `localnet` state until broadcast? Wait, in simulated mode `simulate` implies broadcast for localnet. If not, this is a friction point.
- Does `query.sync()` wait for the blockdag to accept the tx?
- Is the receipt artifact immediately verifiable?

## Actual Friction Encounters

1. **Bug**: `Artifact <hash> corrupted or invalid: [{"code": "ECONOMIC_VIOLATION", "severity": "error", "message": "Fee mismatch: artifact reports 350, recomputed 0 (at rate 1)"}]`.
   - **Context**: When verifying a `TxReceipt` artifact generated via `tx.simulate` in simulated network mode, the `HardkasReplay.verify` method correctly loads the receipt, but the underlying verification logic recalculates the fee based on standard mass rules, which yields 0 for pure simulated TXs (or the simulated mass is mismatched). The artifact itself correctly captured `350` (likely the default fallback fee), but the verifier rejects it.
   - **Impact**: You cannot cryptographically verify artifacts generated in pure simulation mode if the fee re-computation rules don't match.
