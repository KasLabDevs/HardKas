[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SubmissionFeeEvidence

# Type Alias: SubmissionFeeEvidence

> **SubmissionFeeEvidence** = \{ `feeSompi`: `string`; `inputCount`: `number`; `inputsSompi`: `string`; `method`: `"inputs-minus-outputs"`; `outputCount`: `number`; `outputsSompi`: `string`; `planArtifactId`: `string`; `status`: `"derived"`; \} \| \{ `reason`: `string`; `status`: `"insufficient-evidence"`; \}

Defined in: [packages/artifacts/src/submission-fee.ts:17](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/submission-fee.ts#L17)

## Union Members

### Type Literal

\{ `feeSompi`: `string`; `inputCount`: `number`; `inputsSompi`: `string`; `method`: `"inputs-minus-outputs"`; `outputCount`: `number`; `outputsSompi`: `string`; `planArtifactId`: `string`; `status`: `"derived"`; \}

#### feeSompi

> **feeSompi**: `string`

#### inputCount

> **inputCount**: `number`

#### inputsSompi

> **inputsSompi**: `string`

Σ amount of the consumed outpoints, taken from the plan's authenticated inputs.

#### method

> **method**: `"inputs-minus-outputs"`

#### outputCount

> **outputCount**: `number`

#### outputsSompi

> **outputsSompi**: `string`

Σ amount of the outputs of the SIGNED transaction (payment + change).

#### planArtifactId

> **planArtifactId**: `string`

The plan whose inputs supplied the consumed amounts (the signed's authenticated parent).

#### status

> **status**: `"derived"`

***

### Type Literal

\{ `reason`: `string`; `status`: `"insufficient-evidence"`; \}
