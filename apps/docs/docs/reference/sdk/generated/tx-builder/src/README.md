[**HardKAS SDK**](../../README.md)

***

[HardKAS SDK](../../README.md) / tx-builder/src

# tx-builder/src

## Classes

- [FeeConvergenceError](classes/FeeConvergenceError.md)
- [TxPlanService](classes/TxPlanService.md)

## Interfaces

- [CoinSelectionRequest](interfaces/CoinSelectionRequest.md)
- [CoinSelectionResult](interfaces/CoinSelectionResult.md)
- [ConsensusMassInput](interfaces/ConsensusMassInput.md)
- [ConsensusMassResult](interfaces/ConsensusMassResult.md)
- [ConsolidationRequest](interfaces/ConsolidationRequest.md)
- [CovenantBindingInput](interfaces/CovenantBindingInput.md)
- [CreateUtxoContextInput](interfaces/CreateUtxoContextInput.md)
- [DiscoverUtxosInput](interfaces/DiscoverUtxosInput.md)
- [DiscoverUtxosResult](interfaces/DiscoverUtxosResult.md)
- [FeeEstimationRequest](interfaces/FeeEstimationRequest.md)
- [FeeEstimationResult](interfaces/FeeEstimationResult.md)
- [FilterMatureUtxosInput](interfaces/FilterMatureUtxosInput.md)
- [FilterMatureUtxosResult](interfaces/FilterMatureUtxosResult.md)
- [FlatUtxo](interfaces/FlatUtxo.md)
- [GeneratorSettingsInput](interfaces/GeneratorSettingsInput.md)
- [KaspaUriRequest](interfaces/KaspaUriRequest.md)
- [KaspaUriResult](interfaces/KaspaUriResult.md)
- [MassBreakdown](interfaces/MassBreakdown.md)
- [MassEstimateResult](interfaces/MassEstimateResult.md)
- [Outpoint](interfaces/Outpoint.md)
- [Output](interfaces/Output.md)
- [PlanTransactionRequest](interfaces/PlanTransactionRequest.md)
- [SemanticVerificationIssue](interfaces/SemanticVerificationIssue.md)
- [SemanticVerificationResult](interfaces/SemanticVerificationResult.md)
- [SemanticVerifyContext](interfaces/SemanticVerifyContext.md)
- [TransactionContext](interfaces/TransactionContext.md)
- [TransactionEngineConfig](interfaces/TransactionEngineConfig.md)
- [TransactionIntent](interfaces/TransactionIntent.md)
- [TransactionPolicies](interfaces/TransactionPolicies.md)
- [TxBuildRequest](interfaces/TxBuildRequest.md)
- [TxOutput](interfaces/TxOutput.md)
- [TxPlan](interfaces/TxPlan.md)
- [TxPlanResult](interfaces/TxPlanResult.md)
- [TxPlanServiceOptions](interfaces/TxPlanServiceOptions.md)
- [UpstreamMassInput](interfaces/UpstreamMassInput.md)
- [UpstreamMassResult](interfaces/UpstreamMassResult.md)
- [Utxo](interfaces/Utxo.md)
- [UtxoContextHandle](interfaces/UtxoContextHandle.md)
- [UtxoProvider](interfaces/UtxoProvider.md)

## Type Aliases

- [CoinSelectionStrategy](type-aliases/CoinSelectionStrategy.md)
- [EngineFeePolicy](type-aliases/EngineFeePolicy.md)
- [FeePolicy](type-aliases/FeePolicy.md)
- [NetworkType](type-aliases/NetworkType.md)
- [PlannerAuthority](type-aliases/PlannerAuthority.md)
- [SelectionPolicy](type-aliases/SelectionPolicy.md)
- [SemanticVerificationSeverity](type-aliases/SemanticVerificationSeverity.md)
- [Sompi](type-aliases/Sompi.md)

## Variables

- [~~DEFAULT\_MINIMUM\_RELAY\_RATE\_SOMPI\_PER\_MASS~~](variables/DEFAULT_MINIMUM_RELAY_RATE_SOMPI_PER_MASS.md)
- [DUST\_THRESHOLD\_SOMPI](variables/DUST_THRESHOLD_SOMPI.md)
- [MASS\_AUTHORITY](variables/MASS_AUTHORITY.md)
- [MAX\_FEE\_SELECTION\_PASSES](variables/MAX_FEE_SELECTION_PASSES.md)

## Functions

- [adapterAuthority](functions/adapterAuthority.md)
- [buildKaspaUri](functions/buildKaspaUri.md)
- [buildPaymentPlan](functions/buildPaymentPlan.md)
- [buildTransaction](functions/buildTransaction.md)
- [buildTransactions](functions/buildTransactions.md)
- [calculateConsensusNonContextualMass](functions/calculateConsensusNonContextualMass.md)
- [calculateUpstreamMass](functions/calculateUpstreamMass.md)
- [calculateUpstreamStorageMass](functions/calculateUpstreamStorageMass.md)
- [createMockUtxo](functions/createMockUtxo.md)
- [createUtxoContext](functions/createUtxoContext.md)
- [discoverUtxos](functions/discoverUtxos.md)
- [~~estimateFee~~](functions/estimateFee.md)
- [estimateFeeFromMass](functions/estimateFeeFromMass.md)
- [estimateMass](functions/estimateMass.md)
- [estimateTransactionMass](functions/estimateTransactionMass.md)
- [estimateTransactionsUpstream](functions/estimateTransactionsUpstream.md)
- [filterMatureUtxos](functions/filterMatureUtxos.md)
- [measureBuiltTransactionMass](functions/measureBuiltTransactionMass.md)
- [measureUpstreamMass](functions/measureUpstreamMass.md)
- [networkParamsUpstream](functions/networkParamsUpstream.md)
- [planSingleOutputSpend](functions/planSingleOutputSpend.md)
- [rpcFeeEstimate](functions/rpcFeeEstimate.md)
- [~~selectCoins~~](functions/selectCoins.md)
- [sompiToKasDisplay](functions/sompiToKasDisplay.md)
- [toTxBuilderUtxo](functions/toTxBuilderUtxo.md)
- [toWalletQueryUtxo](functions/toWalletQueryUtxo.md)
- [verifySignedTxSemantics](functions/verifySignedTxSemantics.md)
- [verifyTxPlanSemantics](functions/verifyTxPlanSemantics.md)
- [verifyTxReceiptSemantics](functions/verifyTxReceiptSemantics.md)
