[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / assertValidSignedTxArtifact

# Function: assertValidSignedTxArtifact()

> **assertValidSignedTxArtifact**(`value`): asserts value is \{ amountSompi?: string; assumptionLevel?: string; computeBudget?: string; contentHash?: string; createdAt?: string; execution?: \{ domain?: "kaspa-l1" \| "evm-l2"; mode?: "rpc" \| "simulator" \| "localnet" \| "l2-rpc"; network?: string \}; from?: \{ accountName?: string; address?: string; input?: string \}; hardkasVersion?: string; hashVersion?: string \| number; lane?: string; lineage?: \{ artifactId?: string; lineageId?: string; parentArtifactId?: string; rootArtifactId?: string; sequence?: number \}; lineageDepth?: number; metadata?: any; mode?: "rpc" \| "simulator" \| "localnet"; multisig?: \{ requiredSigners?: string\[\]; signatures?: \{ signature?: string; signer?: string \}\[\]; threshold?: number \}; networkId?: "simnet" \| "mainnet" \| "testnet-10" \| "testnet-11" \| "testnet-12" \| "simnet-1" \| "devnet" \| "simulated" \| "igra"; parents?: string\[\]; schema?: "hardkas.signedTx"; schemaVersion?: string; scriptCapabilities?: ("p2pk" \| "multisig" \| "timelock" \| "covenant-experimental" \| "silverscript-experimental" \| "tockata-experimental")\[\]; scriptMetadata?: \{ consensusImpact?: "experimental" \| "none"; experimental?: boolean; language?: "native" \| "silverscript" \| "tockata"; notes?: string\[\]; version?: string \}; scriptProfile?: "experimental" \| "standard"; signatureMetadata?: \{ signedAt?: string; signer?: string \}\[\]; signedId?: string; signedTransaction?: \{ format?: string; payload?: string \}; sourcePlanId?: string; status?: "signed" \| "partially\_signed"; storageMass?: string; to?: \{ accountName?: string; address?: string; input?: string \}; txId?: string; txVersion?: 0 \| 1; unsignedPayloadHash?: string; version?: "1.0.0-alpha"; workflowId?: string \}

Defined in: [packages/artifacts/src/validate.ts:79](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/validate.ts#L79)

## Parameters

### value

`unknown`

## Returns

asserts value is \{ amountSompi?: string; assumptionLevel?: string; computeBudget?: string; contentHash?: string; createdAt?: string; execution?: \{ domain?: "kaspa-l1" \| "evm-l2"; mode?: "rpc" \| "simulator" \| "localnet" \| "l2-rpc"; network?: string \}; from?: \{ accountName?: string; address?: string; input?: string \}; hardkasVersion?: string; hashVersion?: string \| number; lane?: string; lineage?: \{ artifactId?: string; lineageId?: string; parentArtifactId?: string; rootArtifactId?: string; sequence?: number \}; lineageDepth?: number; metadata?: any; mode?: "rpc" \| "simulator" \| "localnet"; multisig?: \{ requiredSigners?: string\[\]; signatures?: \{ signature?: string; signer?: string \}\[\]; threshold?: number \}; networkId?: "simnet" \| "mainnet" \| "testnet-10" \| "testnet-11" \| "testnet-12" \| "simnet-1" \| "devnet" \| "simulated" \| "igra"; parents?: string\[\]; schema?: "hardkas.signedTx"; schemaVersion?: string; scriptCapabilities?: ("p2pk" \| "multisig" \| "timelock" \| "covenant-experimental" \| "silverscript-experimental" \| "tockata-experimental")\[\]; scriptMetadata?: \{ consensusImpact?: "experimental" \| "none"; experimental?: boolean; language?: "native" \| "silverscript" \| "tockata"; notes?: string\[\]; version?: string \}; scriptProfile?: "experimental" \| "standard"; signatureMetadata?: \{ signedAt?: string; signer?: string \}\[\]; signedId?: string; signedTransaction?: \{ format?: string; payload?: string \}; sourcePlanId?: string; status?: "signed" \| "partially\_signed"; storageMass?: string; to?: \{ accountName?: string; address?: string; input?: string \}; txId?: string; txVersion?: 0 \| 1; unsignedPayloadHash?: string; version?: "1.0.0-alpha"; workflowId?: string \}
