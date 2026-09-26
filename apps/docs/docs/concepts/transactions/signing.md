---
title: Signing & Authorization
sidebar_position: 5
---

import QualificationContext from '@site/src/components/QualificationContext';

# Signing & Authorization

A `TxPlanArtifact` is merely an intent. To become executable, it requires cryptographic authorization from the owner of the inputs.

## The Signing Operation

The standard signing operation in HardKAS:
1. Loads the `TxPlanArtifact`.
2. Locates the required private key (e.g., deterministic simulator keys, local config-provided keys).
3. Applies Kaspa-compliant ECDSA/Schnorr signatures to the transaction inputs.
4. Outputs a `SignedTxArtifact`.

*Note: HardKAS also supports advanced offline orchestration mechanisms like PSKT (Portable Signing Sessions) and Multisig architectures, which will be documented in their own advanced guides.*

## The `SignedTxArtifact`

The output of the signing phase is a strictly typed `SignedTxArtifact`.

### What it proves
It proves **authorization**. It cryptographically asserts that the holder of the required private keys approved the exact geometric bounds and network intent defined in the parent plan. The `contentHash` of the plan is hashed into the signature logic, making it impossible to tamper with the plan post-signing.

### What it does NOT prove
A `SignedTxArtifact` is fully disconnected from the network state. 
- It does **not** prove that the Kaspa node will accept it.
- It does **not** prove that the inputs haven't already been spent by a competing transaction in the mempool.
- It is **not** evidence of execution.

<QualificationContext capabilityId="artifacts" />
