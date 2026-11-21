[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / buildR0Groth16Scripts

# Function: buildR0Groth16Scripts()

> **buildR0Groth16Scripts**(`params`): [`R0Groth16ScriptsResult`](../interfaces/R0Groth16ScriptsResult.md)

Defined in: [packages/sdk/src/zk/toccata.ts:910](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L910)

Builds the Kaspa Toccata P2SH redeem script (locking) and signature script (unlocking) for a
RISC Zero Groth16 receipt, through kaspa-wasm's ZkScriptBuilder (upstream minimal flow:
commitToGroth16(imageId) + finalizeWithGroth16Proof(receipt, journalHash)).

Authorization model, proof-only (the default; HK-16, by upstream design): the lock binds the image id only.
"Whoever holds a valid receipt of that program spends." The journal is supplied by the unlocking script;
outputs, outpoint and network are not bound, so replay across UTXOs/networks and front-running of a mempool
spend are properties of the design. Every result carries the warning ZK_LOCK_BINDS_IMAGE_ID_ONLY.

proof-and-output-bound (`bindingPolicy`): after the Groth16 verifier, the redeem script checks by output
introspection the output count and the payout's (and change's) script public key and amount, then requires exactly
one input and an input of at most the bound outputs plus `maxFeeSompi`. A valid receipt can only send the funds to
those outputs. The spent outpoint is never bound (circular: `utxoBinding` is refused). The bound script public key is
the version-prefixed encoding OpTxOutputSpk pushes. Results carry ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS.

Storage mass (G1): the spend of an output-bound lock is measured as it will be funded (one input of
requiredFundingSompi, the bound outputs, the default compute budget; fee never below the node's relay floor). If its
storage mass (KIP-9, C/output - C/input) is above BLOCK_STORAGE_MASS_LIMIT, which a small payout or change causes, no
node will ever include it: the lock is refused (ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT, nothing built) with the
smallest amounts that fit (minimumBoundAmountsSompi). Storage mass grows with the amount funded; when a UTXO within the
lock's input limit would exceed it, the warning ZK_BOUND_LOCK_OVERFUNDING_UNSPENDABLE says from which amount.

Addresses: the simnet address is always returned. A testnet-10 address is returned only when requested in
`addressNetworks` (proof-only also needs `acknowledgeImageIdOnlyLock: true`), and never for a proof-only lock of a
public test program (its image id is in PUBLIC_R0_TEST_VECTORS); an output-bound lock of one is built with the warning
ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE (C-1).

Mainnet (MAINNET TOTAL LOCKDOWN, P37): a lock's signature script IS the authorization of its spend (a ZK spend
carries no signature), so no lock is built for mainnet. A mainnet entry in `addressNetworks`, in any spelling
(`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case), or a bound payout or change address of mainnet
(`kaspa:`) throws MAINNET_SIGNING_DISABLED before the receipt is read: no mainnet P2SH address and no signature script.

Receipt cross-check (HK-19): when the receipt carries its claim pruned to a digest (the usual Borsh
encoding), the digest is recomputed from (imageId, journalHash) and a mismatch is rejected
(ZK_RECEIPT_CLAIM_MISMATCH): a wrong image id would lock funds to a program with no such receipt, a wrong
journal would make the unlocking script fail.

## Parameters

### params

[`R0Groth16ScriptParams`](../interfaces/R0Groth16ScriptParams.md)

## Returns

[`R0Groth16ScriptsResult`](../interfaces/R0Groth16ScriptsResult.md)
