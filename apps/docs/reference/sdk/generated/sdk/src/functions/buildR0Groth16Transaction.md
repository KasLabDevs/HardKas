[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / buildR0Groth16Transaction

# Function: buildR0Groth16Transaction()

> **buildR0Groth16Transaction**(`params`): [`R0Groth16TxResult`](../interfaces/R0Groth16TxResult.md)

Defined in: [packages/sdk/src/zk/toccata.ts:1626](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L1626)

Builds (does not sign or broadcast) a version-1 transaction spending a P2SH UTXO locked by a
RISC Zero Groth16 lock. The compute budget must be a u16 that covers the precompile (tag cost + 250,000
script units per VK element + the observed script overhead; ZK-07) and whose compute mass fits a block;
the fee is derived from the mass kaspa-wasm reports for the real transaction plus the compute-budget term.
Every result carries the lock's authorization-model warning (ZK_LOCK_BINDS_IMAGE_ID_ONLY, HK-16, or
ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS); a public network is refused for a lock of a public test program unless its
redeem script really binds the outputs (C-1; then ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE). Whether it does, and so
`consensusEnforced`, is read from the redeem script with verifyR0Groth16Scripts, never from the scripts object's
`bindingMode` label (C-7). In proof-and-output-bound
mode the outputs are exactly the bound ones and the fee is what the UTXO holds beyond them; any fee above the cap
(feeOptions.maxFeeSompi, default DEFAULT_MAX_FEE_CAP_SOMPI) is refused (ZK_FEE_ABOVE_CAP).
G1 · the fee floor is the node's (minimumRelayFeeSompi: v1FeeMass / v1MinimumRelayFee, compute or transient mass, never
storage mass) and the storage mass (storageMass, KIP-9) must fit BLOCK_STORAGE_MASS_LIMIT
(ZK_TX_EXCEEDS_BLOCK_STORAGE_MASS_LIMIT): both are the rusty-kaspad 2.1.0 rules, proven on simnet.
The emitted ZK fact records the real image id, the SHA-256 of the proof BYTES, no placeholder and no
clock (HK-20); verifiedOffChain is true only with a genuine verifyR0Groth16ReceiptLocal result (HK-17).

Mainnet (any spelling: `mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case) throws MAINNET_SIGNING_DISABLED
before anything is read or built (MAINNET TOTAL LOCKDOWN, crypto review H5): a ZK spend carries no signature, its
signature script (journal hash, proof, redeem script) IS the authorization, so the transaction this returns is complete
and any tool could broadcast it. The guard decides from the declared network (a Kaspa transaction does not commit to one).

## Parameters

### params

[`BuildR0Groth16TxParams`](../interfaces/BuildR0Groth16TxParams.md)

## Returns

[`R0Groth16TxResult`](../interfaces/R0Groth16TxResult.md)
