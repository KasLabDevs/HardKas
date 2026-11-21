[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / readDeclaredHashVersion

# Function: readDeclaredHashVersion()

> **readDeclaredHashVersion**(`artifact`): `number`

Defined in: [packages/artifacts/src/canonical.ts:172](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/canonical.ts#L172)

The hash version an artifact declares, or `null` when it declares none or an
invalid one. Strings, floats, out-of-range numbers and absence are all
invalid: no reader may fall back to another version (IC-4′.2).

## Parameters

### artifact

`unknown`

## Returns

`number`
