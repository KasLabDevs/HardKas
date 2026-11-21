[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / kaspaAddressVersion

# Function: kaspaAddressVersion()

> **kaspaAddressVersion**(`address`): `number`

Defined in: [packages/tx-builder/src/address-scheme.ts:18](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/address-scheme.ts#L18)

The version byte of a Kaspa address (0 Schnorr P2PK, 1 ECDSA P2PK, 8 P2SH), read from the first two 5-bit groups of
its payload; undefined for anything that is not `<prefix>:<bech32 data>` (the simulator's `kaspa:sim_*` included).
The checksum is not verified here: the node and kaspa-wasm do that.

## Parameters

### address

`unknown`

## Returns

`number`
