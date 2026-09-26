# What is SilverScript?

> **SilverScript:** OFFICIAL RELEASE v1.0.0

SilverScript is the official high-level "smart contract" language for Kaspa. The `v1.0.0` compiler was officially released on September 9, 2026.

## Language vs VM

> **Canonical Invariant:** SilverScript is not a new Virtual Machine. It compiles down to standard Kaspa Script.

Kaspa L1 does not execute SilverScript source code, nor does it possess an Ethereum-like EVM. 

When you write a SilverScript program, the compiler (`silverc`) translates your high-level logic (variables, state transitions, constraints) into low-level Kaspa Script opcodes. When the transaction is submitted to the network, the Kaspa node blindly executes the compiled Kaspa Script. The node has no awareness that SilverScript even exists.

## SilverScript vs EVM

To understand the paradigm shift, observe the differences without value judgments:

| Concept | Solidity / EVM | SilverScript / Kaspa |
| :--- | :--- | :--- |
| **Execution Environment** | Account-based Virtual Machine | UTXO Script Validation |
| **State Storage** | Persistent Contract Account | Carried in the UTXO output/script |
| **Global State Access** | Yes (can read any contract) | No (isolated to the spending Tx) |
| **Language Target** | EVM Bytecode | Kaspa Script |

## HardKAS Orchestration (`hardkas silver`)

HardKAS integrates the official SilverScript toolchain directly into your development workflow.

**Status:** `IMPLEMENTED` / `TESTED`

HardKAS provides the following orchestration capabilities:
* `hardkas silver compile`: Invokes the managed `silverc v1.0.0` compiler and records the provenance.
* `hardkas silver verify`: Reproduces a compilation byte-for-byte to ensure artifact integrity.
* `hardkas silver deploy`: Constructs a funding transaction for a P2SH compiled contract.
* `hardkas silver spend`: Constructs a spending transaction satisfying the compiled script.

*Note: HardKAS pins specific versions of `silverc` in its SDK. While upstream may release newer versions, HardKAS strictly controls the toolchain version used to build your artifacts to guarantee reproducibility.*

