[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / PAYMENT\_PREFLIGHT\_GUARANTEE\_ECDSA

# Variable: PAYMENT\_PREFLIGHT\_GUARANTEE\_ECDSA

> `const` **PAYMENT\_PREFLIGHT\_GUARANTEE\_ECDSA**: `string`

Defined in: [packages/sdk/src/payment-preflight.ts:34](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/payment-preflight.ts#L34)

ECDSA spends · the same guarantee for a send with at least one ECDSA P2PK input (each signature verified with its own
scheme: BIP340 for Schnorr inputs, low-S ECDSA for ECDSA ones). A send of Schnorr inputs only keeps the guarantee above.
