---
title: SilverScript IDE & Local Development
description: A complete guide to writing, compiling, inspecting, and testing SilverScript smart contracts and covenants locally using HardKAS and the official silverc compiler.
sidebar_label: SilverScript IDE & Local Dev
sidebar_position: 2
---

# SilverScript IDE & Local Development: Write, Compile & Test Kaspa Covenants

**SilverScript** is Kaspa's domain-specific programming language for writing native smart contracts and covenants on Layer 1. Unlike Ethereum's Solidity, which compiles to bytecode executed in a stateful Virtual Machine, SilverScript compiles to structured Kaspa script encumbering Unspent Transaction Outputs (UTXOs).

With the network-wide activation of the **Toccata upgrade on Kaspa mainnet on June 30, 2026 (at DAA score 474,165,565)**, native covenants became active at the protocol level. On **September 9, 2026**, the **SilverScript compiler v1.0.0 (`silverc`)** was officially released.

When engineering automated payment vaults, escrows, inheritance timelocks, or atomic swaps on Kaspa, developers require a structured development environment to compile contracts, inspect binary program hashes, and test spending conditions before deploying to testnet.

This guide explains how to set up a local-first SilverScript development workflow using the official compiler and the **HardKAS** deterministic test environment.

---

## What is SilverScript?

SilverScript abstracts low-level Kaspa script opcodes into a type-safe, human-readable language. It allows developers to express complex spending conditions:
- **Covenants:** Restricting not just *who* can spend a coin, but *how* and *where* the coin can be spent in subsequent transaction outputs.
- **Multi-Party Spending:** Dynamic threshold multisig and cooperative release rules.
- **Timelocks:** Sequence-based and absolute block-time maturation conditions.

### The Developer Stack: Compiler vs. Protocol Consensus
A critical technical distinction must be maintained when developing SilverScript contracts:
1. **The Protocol (Toccata Consensus):** Active on Kaspa mainnet since June 30, 2026 (DAA 474,165,565). The consensus engine validates covenant opcodes, signature checks, and transaction mass.
2. **The Compiler (`silverc v1.0.0`):** The official standalone compiler released on September 9, 2026. Developers use `silverc` to compile `.sil` source code into script bytecodes and generate ABIs.
3. **The Framework (HardKAS):** An open-source local framework providing in-memory simulation, Dockerized `rusty-kaspa` localnets, and automated Vitest testing harnesses.
4. **Experimental Modules (vProgs):** Advanced programmability extensions (vProgs) are experimental research prototypes and not part of the standard production pipeline.

---

## Browser IDE (SilverScript Studio) vs. Local Engineering (HardKAS)

The Kaspa ecosystem provides two complementary environments for SilverScript development:

| Capability | SilverScript Studio (Web IDE) | HardKAS (Local-First Framework) |
|---|---|---|
| **Environment** | Web browser (cloud / client-side) | Local machine CLI, IDE & CI/CD pipeline |
| **Best For** | Rapid prototyping, visual exploration, learning | Automated test suites, backend daemons, production pipelines |
| **Testing** | Visual input parameters in UI | Automated test scripts using TypeScript / Vitest |
| **Node Connection** | Public wRPC endpoints | In-memory simulator + local Dockerized `rusty-kaspa` node |
| **Artifact Lineage** | In-browser session state | Version-controlled JSON Evidence Packages |

---

## Step-by-Step: Setting Up a Local SilverScript Project

### 1. Initialize a HardKAS Workspace
Create a local workspace configured for SilverScript development:

```bash
npx hardkas init kaspa-covenants-lab
cd kaspa-covenants-lab
```

Your workspace will contain a `contracts/` directory dedicated to SilverScript `.sil` source files.

### 2. Author a SilverScript Contract
Create a simple 2-of-2 escrow with a refund timelock: `contracts/EscrowTimelock.sil`:

```solidity
contract EscrowTimelock(
    pubkey buyer,
    pubkey seller,
    pubkey arbiter,
    int timeoutBlock
) {
    // Path 1: Mutual release (Buyer + Seller) OR Dispute resolution (Arbiter + either party)
    entry release(sig s1, sig s2) {
        require(checkSig(s1, buyer) && checkSig(s2, seller) ||
                checkSig(s1, arbiter) && (checkSig(s2, buyer) || checkSig(s2, seller)));
    }

    // Path 2: Timeout refund to buyer after specified block maturation
    entry refund(sig buyerSig) {
        require(checkLockTime(timeoutBlock));
        require(checkSig(buyerSig, buyer));
    }
}
```

### 3. Compile Contracts to Kaspa Bytecode
Compile the contract using the integrated toolchain:

```bash
hardkas run compile
```

This compiles `EscrowTimelock.sil` and generates structured artifacts in `.hardkas/artifacts/`:
- **ABI Definition:** Parameter types, entrypoint names, and method signatures.
- **Covenant Script Public Key:** The exact `scriptPublicKey` format required to lock coins onto the contract.
- **Program Hash:** Cryptographic commitment identifying the covenant on the BlockDAG.

---

## Simulating and Testing Covenant Execution with the HardKAS SDK

Once compiled, you can test deployment and spending paths deterministically using the real HardKAS SDK:

```typescript
import { describe, it, expect } from 'vitest';
import { Hardkas } from '@hardkas/sdk';

describe('EscrowTimelock Covenant Tests', () => {
  it('should plan and simulate covenant deployment and valid mutual spend', async () => {
    // 1. Initialize HardKAS in deterministic simulation mode
    const sdk = await Hardkas.create({
      execution: { mode: 'simulator', domain: 'kaspa-l1', network: 'simulated' }
    });

    const compiledScript = '20abcdef...ac'; // Compiled bytecode from EscrowTimelock.sil

    // 2. Plan the covenant deployment (locking 20 KAS into the covenant script)
    const deployPlan = await sdk.covenants.planDeploy({
      script: compiledScript,
      amount: 2_000_000_000n, // 20 KAS in sompi
      from: 'alice',
    });

    expect(deployPlan.summary.outputsCount).toBeGreaterThanOrEqual(1);

    // 3. Sign and simulate the deployment
    const signedDeploy = await sdk.tx.sign(deployPlan, 'alice');
    const { receipt } = await sdk.tx.simulate(signedDeploy);
    expect(receipt.txId).toBeDefined();

    // 4. Plan spending from the covenant UTXO
    const spendPlan = await sdk.covenants.planSpend({
      covenantId: receipt.txId,
      to: 'kaspa:precipient...',
      amount: 1_990_000_000n,
      from: 'alice',
    });

    // 5. Verify the spending transaction logic
    const verified = await sdk.tx.verify(spendPlan);
    expect(verified.isValid).toBe(true);
  });
});
```

---

## Inspecting Transactions in the HardKAS Visual Console

For visual inspection of UTXO graphs and covenant state transitions, launch the HardKAS developer suite:

```bash
hardkas console
```

The console allows you to:
- Inspect decoded SilverScript opcodes and stack execution traces.
- Verify signature verification hashes (Schnorr signatures).
- Audit change outputs and mass calculations in real time.

---

## Technical Boundaries & Honest Limitations

1. **Simulation vs. Mining Consensus:** Passing a SilverScript test in the local simulator confirms that the script logic, signature verification, and timelocks comply with protocol rules. However, it does not guarantee network acceptance if network mining fee policies are not met.
2. **Covenants are Stateless:** SilverScript contracts do not possess internal persistent storage variables. State changes are modeled by passing funds into a new UTXO encumbered by an updated covenant contract.
3. **Policy Restrictions:** Mainnet is locked down in this release: no connection (reads included, even to an endpoint you declare), no signing, no broadcast; no flag, option or configuration enables it (`MAINNET_CONNECTION_DISABLED`, `MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`). SilverScript on mainnet is `SILVERSCRIPT_MAINNET_NOT_ENABLED`.

---

## Related Documentation & Resources

- [Official SilverScript Compiler Specification](https://github.com/kaspanet/silverscript)
- [SilverScript Studio (Browser IDE)](https://silverscriptstudio.com)
- [Testing Kaspa Covenants Guide](./testing-kaspa-covenants.md)
- [HardKAS Execution Contracts Architecture](../concepts/execution-contract.md)
