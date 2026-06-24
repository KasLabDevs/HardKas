# Quickstart

The fastest way to experience HardKAS is in deterministic simulated mode.

1. **Initialize Workspace**
   ```bash
   hardkas dev fixture generate
   ```
   *This populates your localnet with simulated accounts and balances.*

2. **Plan a Transaction**
   ```bash
   hardkas tx plan --from kaspa:sim_alice --to kaspa:sim_bob --amount 10
   ```
   *Outputs a deterministic `txPlan` artifact.*

3. **Verify the Artifact**
   ```bash
   hardkas artifact verify .hardkas/artifacts/txPlan-*.json
   ```

4. **Sign the Transaction**
   ```bash
   hardkas tx sign .hardkas/artifacts/txPlan-*.json --account kaspa:sim_alice
   ```

5. **Send and Settle**
   ```bash
   hardkas tx send .hardkas/artifacts/signedTx-*.json
   ```
