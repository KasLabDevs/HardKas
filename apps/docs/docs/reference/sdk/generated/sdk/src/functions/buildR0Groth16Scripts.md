[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / buildR0Groth16Scripts

# Function: buildR0Groth16Scripts()

> **buildR0Groth16Scripts**(`params`): [`R0Groth16ScriptsResult`](../interfaces/R0Groth16ScriptsResult.md)

Defined in: [packages/sdk/src/zk/toccata.ts:731](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L731)

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

Addresses: the simnet address is always returned. A testnet-10 address is returned only when requested in
`addressNetworks` (proof-only also needs `acknowledgeImageIdOnlyLock: true`), and never for a public test vector.

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
