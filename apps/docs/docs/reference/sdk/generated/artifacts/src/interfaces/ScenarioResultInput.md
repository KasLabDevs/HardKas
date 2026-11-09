[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ScenarioResultInput

# Interface: ScenarioResultInput

Defined in: [packages/artifacts/src/scenario-result.ts:28](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L28)

## Properties

### artifactsGenerated?

> `optional` **artifactsGenerated?**: `string`[]

Defined in: [packages/artifacts/src/scenario-result.ts:33](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L33)

***

### createdAt?

> `optional` **createdAt?**: `string`

Defined in: [packages/artifacts/src/scenario-result.ts:39](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L39)

***

### error?

> `optional` **error?**: `object`

Defined in: [packages/artifacts/src/scenario-result.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L36)

#### code

> **code**: `string`

#### component?

> `optional` **component?**: `string`

#### message

> **message**: `string`

#### recoverable?

> `optional` **recoverable?**: `boolean`

***

### evidenceClaim?

> `optional` **evidenceClaim?**: [`ScenarioEvidenceClaim`](../type-aliases/ScenarioEvidenceClaim.md)

Defined in: [packages/artifacts/src/scenario-result.ts:35](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L35)

Defaults to `none` for a run that names no artifact and `artifacts` otherwise (never `payment` by default).

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [packages/artifacts/src/scenario-result.ts:38](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L38)

Free, authenticated context (e.g. `{ kind: "task", taskName, args, result }`).

***

### mode

> **mode**: [`ScenarioResultMode`](../type-aliases/ScenarioResultMode.md)

Defined in: [packages/artifacts/src/scenario-result.ts:32](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L32)

***

### networkId

> **networkId**: `string`

Defined in: [packages/artifacts/src/scenario-result.ts:31](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L31)

***

### scenarioName

> **scenarioName**: `string`

Defined in: [packages/artifacts/src/scenario-result.ts:29](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L29)

***

### status

> **status**: `"failed"` \| `"passed"`

Defined in: [packages/artifacts/src/scenario-result.ts:30](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L30)
