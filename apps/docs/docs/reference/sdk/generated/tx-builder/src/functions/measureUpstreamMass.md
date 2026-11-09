[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / measureUpstreamMass

# Function: measureUpstreamMass()

> **measureUpstreamMass**(`input`): [`UpstreamMassResult`](../interfaces/UpstreamMassResult.md)

Defined in: [packages/tx-builder/src/mass.ts:134](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/mass.ts#L134)

Mass and minimum fee of a candidate transaction, from the pinned SDK.

Fields that do not affect mass may be placeholders: outpoint identifiers
(fixed size) and, for identities the SDK cannot parse (simulated or mock
addresses), a P2PK-sized script. Each substitution is listed in
`assumptions`. Amounts are always the real ones: storage mass depends on them.

Reports, without throwing, whether the mass is within the standard limit.

## Parameters

### input

[`UpstreamMassInput`](../interfaces/UpstreamMassInput.md)

## Returns

[`UpstreamMassResult`](../interfaces/UpstreamMassResult.md)
