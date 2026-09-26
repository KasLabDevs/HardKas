# Getting Started: The 5-Minute Simulator

The fastest way to understand HardKAS is to build a transaction in the **Simulator**.

You do not need a Kaspa node, Docker, or a network connection. The Simulator runs entirely in-memory and provides instant, deterministic feedback.

## 1. Initialize a Workspace

Create a new directory and initialize HardKAS:

```bash
mkdir hello-hardkas
cd hello-hardkas
hardkas init .
```

This creates a `hardkas.config.ts` configured for the Simulator by default, and populates `.hardkas/localnet.json` with synthetic developer accounts (`alice`, `bob`) that are pre-funded with 1000 synthetic KAS.

## 2. Plan a Transaction

We will send 1 KAS from Alice to Bob.

```bash
hardkas tx plan --from alice --to bob --amount 1 --out plan.json
```

HardKAS instantly evaluates the virtual state, selects the synthetic UTXOs, and generates a deterministic `plan.json`.

## 3. Authorize (Sign)

```bash
hardkas tx sign plan.json --account alice --out signed.json
```

Because this is the Simulator, the keys are synthetic and HardKAS handles the cryptography instantly.

## 4. Execute

```bash
hardkas tx send signed.json --out receipt.json
```

The transaction is instantly applied to the virtual DAG. The resulting `receipt.json` contains the cryptographic proof of execution.

## 5. Verify Evidence (The Simulator Superpower)

Because the Simulator owns the entire state universe, you can mathematically prove that the execution was deterministic:

```bash
hardkas verify receipt.json
```

HardKAS will hash the artifact, trace the lineage back to `plan.json`, and guarantee that no rules were broken during execution.

## Next Steps

You've successfully executed a transaction in zero seconds with zero infrastructure. 

Next, read about [Execution Environments](../concepts/execution-environments.md) to learn how to graduate this exact same workflow to a [Real Node (Localnet)](./localnet-node.md).
