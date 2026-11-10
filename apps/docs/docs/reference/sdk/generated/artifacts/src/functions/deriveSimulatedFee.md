[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / deriveSimulatedFee

# Function: deriveSimulatedFee()

> **deriveSimulatedFee**(`plan`): \{ `feeSompi`: `bigint`; `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `string`; \}

Defined in: [packages/artifacts/src/signed-tx.ts:328](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/signed-tx.ts#L328)

Wave 2(d) · AUD-18: the fee a simulated execution charges is what the plan
consumes minus what it produces (payment outputs plus change). A plan whose
declared `estimatedFeeSompi` is not that difference cannot produce a receipt:
the receipt would record a fee the execution did not charge.

## Parameters

### plan

#### amountSompi?

`string` = `...`

#### assumptionLevel?

`string` = `...`

#### assumptionRef?

`string` = `...`

#### change?

\{ `address?`: `string`; `amountSompi?`: `string`; \} = `...`

#### change.address?

`string` = `...`

#### change.amountSompi?

`string` = `...`

#### computeBudget?

`string` = `...`

#### contentHash?

`string` = `...`

#### covenantOutpoints?

`string`[] = `...`

#### createdAt?

`string` = `...`

#### estimatedFeeSompi?

`string` = `...`

#### estimatedMass?

`string` = `...`

#### execution?

\{ `domain?`: `"kaspa-l1"` \| `"evm-l2"`; `mode?`: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`; `network?`: `string`; \} = `executionTargetSchema`

#### execution.domain?

`"kaspa-l1"` \| `"evm-l2"` = `...`

#### execution.mode?

`"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"` = `...`

#### execution.network?

`string` = `...`

#### from?

\{ `accountName?`: `string`; `address?`: `string`; `input?`: `string`; \} = `AccountRefSchema`

#### from.accountName?

`string` = `...`

#### from.address?

`string` = `...`

#### from.input?

`string` = `...`

#### genesisCovenantGroups?

`object`[] = `...`

#### hardkasVersion?

`string` = `...`

#### hashVersion?

`string` \| `number` = `...`

#### inputs?

`object`[] = `...`

#### lane?

`string` = `...`

#### lineage?

\{ `artifactId?`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \} = `...`

#### lineage.artifactId?

`string` = `...`

#### lineage.lineageId?

`string` = `...`

#### lineage.parentArtifactId?

`string` = `...`

#### lineage.rootArtifactId?

`string` = `...`

#### lineage.sequence?

`number` = `...`

#### lineageDepth?

`number` = `...`

#### maxFeeSompi?

`string` = `...`

#### metadata?

`any` = `...`

#### mode?

`"rpc"` \| `"simulator"` \| `"localnet"` = `executionModeSchema`

#### networkId?

`"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

#### networkProfileRef?

`string` = `...`

#### nextState?

(\{ `covenantId?`: `string`; `input?`: `number`; `outputs?`: `number`[]; `successor?`: \{ `artifactSha256?`: `string`; `constructorArgs?`: `unknown`[]; `state?`: `Record`\<`string`, `unknown`\>; `stateToConstructorArg?`: `Record`\<`string`, `number`\>; \}; \} \| \{ `covenantId?`: `string`; `input?`: `number`; `outputs?`: `number`[]; `states?`: `Record`\<`string`, `unknown`\>[]; \})[] = `...`

#### outputs?

`object`[] = `...`

#### parents?

`string`[] = `...`

#### payload?

`string` = `...`

#### planId?

`string` = `...`

#### plannerAuthority?

`"KASPA_WASM_GENERATOR"` \| `"SYNTHETIC_SIMULATOR"` \| `"HARDKAS_V1_PLANNER"` = `...`

#### plannerAuthorityDetail?

`string` = `...`

#### policyRef?

`string` = `...`

#### policyRefs?

`string`[] = `...`

#### rpcUrl?

`string` = `...`

#### schema?

`"hardkas.txPlan"` = `...`

#### schemaVersion?

`string` = `...`

#### scriptCapabilities?

(`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[] = `...`

#### scriptMetadata?

\{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental?`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \} = `...`

#### scriptMetadata.consensusImpact?

`"experimental"` \| `"none"` = `...`

#### scriptMetadata.experimental?

`boolean` = `...`

#### scriptMetadata.language?

`"native"` \| `"silverscript"` \| `"tockata"` = `...`

#### scriptMetadata.notes?

`string`[] = `...`

#### scriptMetadata.version?

`string` = `...`

#### scriptProfile?

`"standard"` \| `"experimental"` = `...`

#### storageMass?

`string` = `...`

#### to?

\{ `accountName?`: `string`; `address?`: `string`; `input?`: `string`; \} = `AccountRefSchema`

#### to.accountName?

`string` = `...`

#### to.address?

`string` = `...`

#### to.input?

`string` = `...`

#### txVersion?

`0` \| `1` = `...`

#### version?

`"1.0.0-alpha"` = `...`

#### workflowId?

`string` = `...`

## Returns

\{ `feeSompi`: `bigint`; `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `string`; \}
