# What HardKAS Does Not Do

To prevent confusion about the capabilities of the HardKAS developer environment, the following boundaries are explicitly enforced:

1. **Kaspa L1 does not execute EVM**. HardKAS provides a simulated environment for development, but L1 is UTXO-based.
2. The **dev-server is not source of truth**. The dev-server and SQLite DB are projections. The on-disk **artifacts are canonical**.
3. Any bundled **Igra demo is read-only/experimental**. HardKAS makes no trustless exit claims for L2 bridges unless explicitly verified by ZK-proofs in future phases.
