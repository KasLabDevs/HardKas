[**HardKAS SDK**](../../README.md)

***

[HardKAS SDK](../../README.md) / sdk/src

# sdk/src

## Namespaces

- [pskt](namespaces/pskt/README.md)

## Classes

- [EvidenceManager](classes/EvidenceManager.md)
- [Hardkas](classes/Hardkas.md)
- [HardkasAccounts](classes/HardkasAccounts.md)
- [HardkasArtifactsManager](classes/HardkasArtifactsManager.md)
- [HardkasCapabilitiesApi](classes/HardkasCapabilitiesApi.md)
- [HardkasCorpus](classes/HardkasCorpus.md)
- [HardkasCovenants](classes/HardkasCovenants.md)
- [HardkasError](classes/HardkasError.md)
- [HardkasExperimental](classes/HardkasExperimental.md)
- [HardkasFees](classes/HardkasFees.md)
- [HardkasIgra](classes/HardkasIgra.md)
- [HardkasL2](classes/HardkasL2.md)
- [HardkasLineage](classes/HardkasLineage.md)
- [HardkasLocalnet](classes/HardkasLocalnet.md)
- [HardkasProgrammability](classes/HardkasProgrammability.md)
- [HardkasQuery](classes/HardkasQuery.md)
- [HardkasReplay](classes/HardkasReplay.md)
- [HardkasSilver](classes/HardkasSilver.md)
- [HardkasTx](classes/HardkasTx.md)
- [HardkasVprogs](classes/HardkasVprogs.md)
- [HardkasWorkspace](classes/HardkasWorkspace.md)
- [HardkasZk](classes/HardkasZk.md)
- [PrivateKeyAuthorizer](classes/PrivateKeyAuthorizer.md)
- [StaticSignatureScriptAuthorizer](classes/StaticSignatureScriptAuthorizer.md)

## Interfaces

- [ClientEnvelope](interfaces/ClientEnvelope.md)
- [EvidencePackOptions](interfaces/EvidencePackOptions.md)
- [EvidenceVerifyResult](interfaces/EvidenceVerifyResult.md)
- [FundDevWalletsOptions](interfaces/FundDevWalletsOptions.md)
- [HardkasCapabilities](interfaces/HardkasCapabilities.md)
- [HardkasClientOptions](interfaces/HardkasClientOptions.md)
- [HardkasEnvironment](interfaces/HardkasEnvironment.md)
- [HardkasEnvironmentOptions](interfaces/HardkasEnvironmentOptions.md)
- [HardkasOptions](interfaces/HardkasOptions.md)
- [ProgrammabilityAppPlan](interfaces/ProgrammabilityAppPlan.md)
- [ProgrammabilityCapabilitiesResult](interfaces/ProgrammabilityCapabilitiesResult.md)
- [ProgrammabilityClaims](interfaces/ProgrammabilityClaims.md)
- [ProgrammabilityCorpusReport](interfaces/ProgrammabilityCorpusReport.md)
- [ProgrammabilityInspectResult](interfaces/ProgrammabilityInspectResult.md)
- [ProgrammabilityVerifyResult](interfaces/ProgrammabilityVerifyResult.md)
- [SignedTxArtifact](interfaces/SignedTxArtifact.md)
- [SilverCompileOptions](interfaces/SilverCompileOptions.md)
- [SilverP2sh](interfaces/SilverP2sh.md)
- [TaskArgs](interfaces/TaskArgs.md)
- [TaskContext](interfaces/TaskContext.md)
- [TxInputAuthorizationContext](interfaces/TxInputAuthorizationContext.md)
- [TxInputAuthorizer](interfaces/TxInputAuthorizer.md)
- [TxPlanArtifact](interfaces/TxPlanArtifact.md)
- [TxReceiptArtifact](interfaces/TxReceiptArtifact.md)
- [TxTraceArtifact](interfaces/TxTraceArtifact.md)
- [VprogsCapabilitiesResult](interfaces/VprogsCapabilitiesResult.md)
- [VprogsClaims](interfaces/VprogsClaims.md)
- [VprogsInspectResult](interfaces/VprogsInspectResult.md)
- [VprogsStatusResult](interfaces/VprogsStatusResult.md)
- [ZkCapabilities](interfaces/ZkCapabilities.md)
- [ZkCorpusVerifyResult](interfaces/ZkCorpusVerifyResult.md)
- [ZkIssue](interfaces/ZkIssue.md)
- [ZkProofInspectResult](interfaces/ZkProofInspectResult.md)
- [ZkProofVerifyResult](interfaces/ZkProofVerifyResult.md)

## Type Aliases

- [ArtifactId](type-aliases/ArtifactId.md)
- [CorpusIssue](type-aliases/CorpusIssue.md)
- [CorpusVerifyResult](type-aliases/CorpusVerifyResult.md)
- [HardkasMode](type-aliases/HardkasMode.md)
- [KaspaAddress](type-aliases/KaspaAddress.md)
- [LineageId](type-aliases/LineageId.md)
- [NetworkId](type-aliases/NetworkId.md)
- [ProgrammabilityKind](type-aliases/ProgrammabilityKind.md)
- [TxId](type-aliases/TxId.md)
- [ZkProofSystem](type-aliases/ZkProofSystem.md)

## Variables

- [ARTIFACT\_SCHEMAS](variables/ARTIFACT_SCHEMAS.md)
- [defineTask](variables/defineTask.md)
- [HARDKAS\_VERSION](variables/HARDKAS_VERSION.md)
- [SOMPI\_PER\_KAS](variables/SOMPI_PER_KAS.md)

## Functions

- [buildPaymentPlan](functions/buildPaymentPlan.md)
- [createHardkasCapabilities](functions/createHardkasCapabilities.md)
- [createHardkasClient](functions/createHardkasClient.md)
- [createHardkasEnvironment](functions/createHardkasEnvironment.md)
- [createProgrammabilityCapabilities](functions/createProgrammabilityCapabilities.md)
- [createTxPlanArtifact](functions/createTxPlanArtifact.md)
- [createVprogsCapabilities](functions/createVprogsCapabilities.md)
- [createVprogsStatus](functions/createVprogsStatus.md)
- [createZkCapabilities](functions/createZkCapabilities.md)
- [defineHardkasConfig](functions/defineHardkasConfig.md)
- [formatSompiToKas](functions/formatSompiToKas.md)
- [inspectVprogsArtifact](functions/inspectVprogsArtifact.md)
- [inspectZkProof](functions/inspectZkProof.md)
- [parseKasToSompi](functions/parseKasToSompi.md)
- [programmabilityClaims](functions/programmabilityClaims.md)
- [signTxPlanArtifact](functions/signTxPlanArtifact.md)
- [verifyToccataCorpus](functions/verifyToccataCorpus.md)
- [verifyZkCorpus](functions/verifyZkCorpus.md)
- [verifyZkProofLocal](functions/verifyZkProofLocal.md)
- [writeArtifact](functions/writeArtifact.md)
