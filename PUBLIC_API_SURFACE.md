# HardKAS Public API Surface

Generado desde los `dist/**/*.d.ts` publicados de la version `0.12.0-rc.20`.
Este fichero es el **inventario** de lo que se exporta, no una promesa de estabilidad:
las garantias por nivel viven en `EXPERIMENTAL_SURFACE.md` y `DEPRECATED_SURFACE.md`.

- Simbolos publicos: **1449** en **32** paquetes
- Mencionados por alguna prueba: **504** (34.8%)

La columna *Ejercitado* cuenta si el identificador aparece en el corpus de pruebas
(`packages/*/test`, `examples/**`, `scripts/qualification`). Es un techo: mide mencion, no comportamiento.

## Resumen por paquete

| Paquete | Exports | Ejercitado | % |
| :--- | ---: | ---: | ---: |
| `@hardkas/accounts` | 98 | 30 | 30.6% |
| `@hardkas/artifacts` | 253 | 85 | 33.6% |
| `@hardkas/bridge-local` | 12 | 4 | 33.3% |
| `@hardkas/cli` | 8 | 2 | 25% |
| `@hardkas/client` | 6 | 0 | 0% |
| `@hardkas/config` | 27 | 10 | 37% |
| `@hardkas/core` | 221 | 77 | 34.8% |
| `@hardkas/dev-server` | 11 | 5 | 45.5% |
| `@hardkas/escrow` | 6 | 1 | 16.7% |
| `@hardkas/jobs` | 15 | 2 | 13.3% |
| `@hardkas/kaspa-rpc` | 113 | 33 | 29.2% |
| `@hardkas/l2` | 39 | 18 | 46.2% |
| `@hardkas/localnet` | 68 | 44 | 64.7% |
| `@hardkas/node-orchestrator` | 15 | 6 | 40% |
| `@hardkas/node-runner` | 9 | 1 | 11.1% |
| `@hardkas/observability` | 20 | 2 | 10% |
| `@hardkas/plugin-local-indexer` | 3 | 0 | 0% |
| `@hardkas/plugin-rpc-backend` | 9 | 4 | 44.4% |
| `@hardkas/query` | 78 | 30 | 38.5% |
| `@hardkas/query-store` | 29 | 7 | 24.1% |
| `@hardkas/react` | 7 | 0 | 0% |
| `@hardkas/rpc-events` | 27 | 4 | 14.8% |
| `@hardkas/sdk` | 118 | 44 | 37.3% |
| `@hardkas/sessions` | 10 | 7 | 70% |
| `@hardkas/simulator` | 75 | 33 | 44% |
| `@hardkas/simulator-adapters` | 2 | 0 | 0% |
| `@hardkas/storage-postgres` | 5 | 0 | 0% |
| `@hardkas/sync-daemon` | 2 | 1 | 50% |
| `@hardkas/testing` | 27 | 11 | 40.7% |
| `@hardkas/toolkit` | 59 | 8 | 13.6% |
| `@hardkas/tx-builder` | 61 | 27 | 44.3% |
| `@hardkas/wallet-adapter` | 16 | 8 | 50% |

## Inventario por paquete

### `@hardkas/accounts`

98 simbolos, 30 ejercitados (30.6%).

- [x] `AddressManager`
- [ ] `appendToKeystoreJson`
- [x] `assertAccountCompatible`
- [ ] `assertSigningNetworkAllowed`
- [ ] `ChainType`
- [ ] `createDevSigner`
- [ ] `createEmptyRealAccountStore`
- [ ] `CreateKaspaWalletOptions`
- [ ] `createLocalKaspaWallet`
- [ ] `DerivedAddress`
- [ ] `DeriveRequest`
- [x] `describeAccount`
- [ ] `detectCapabilities`
- [ ] `DEV_ACCOUNTS_PASSWORD`
- [ ] `EncryptedKeystoreV2`
- [ ] `ensureDevAccounts`
- [ ] `EvmExportResult`
- [ ] `GeneratedKaspaDevAccount`
- [x] `getDefaultRealAccountsPath`
- [x] `getKaspaSigningBackendStatus`
- [x] `getOrCreateDevAccount`
- [x] `getRealDevAccount`
- [ ] `getRequiredEnv`
- [x] `HardkasAccount`
- [ ] `HardkasAccountKind`
- [ ] `HardkasBaseAccount`
- [ ] `HardkasEvmPrivateKeyAccount`
- [x] `HardkasExternalWalletAccount`
- [x] `HardkasKaspaAccount`
- [ ] `HardkasSigner`
- [ ] `HardkasSignerKind`
- [x] `HardkasSyntheticAccount`
- [ ] `HardkasTxPlanSigner`
- [ ] `HelperDeriveRequest`
- [ ] `importRealDevAccount`
- [ ] `InputAuthorization`
- [ ] `KaspaKeyGenerator`
- [ ] `KaspaSdkKeyGenerator`
- [ ] `KaspaSdkKeyGeneratorOptions`
- [x] `KaspaSdkRealTxSigner`
- [ ] `KaspaSdkRealTxSignerOptions`
- [ ] `KaspaSigningBackendStatus`
- [x] `KaspaWasmPrivateKeySigner`
- [ ] `KaspaWasmSignerOptions`
- [ ] `KeystoreCipherParams`
- [ ] `KeystoreKdfParams`
- [x] `KeystoreManager`
- [x] `KeystorePayload`
- [ ] `KeystoreUnlockResult`
- [ ] `LazyAccountAuthorizer`
- [ ] `listDevAccountsSync`
- [x] `listHardkasAccounts`
- [x] `listRealDevAccounts`
- [ ] `loadKaspaWasm`
- [ ] `loadOrCreateRealAccountStore`
- [x] `loadRealAccountStore`
- [x] `loadRealAccountStoreSync`
- [x] `NetworkType`
- [ ] `parseWasmTxToRpc`
- [ ] `PathRequest`
- [x] `prepareEvmAccountExport`
- [x] `PrivateKeyAuthorizer`
- [x] `RealAccountStore`
- [x] `RealDevAccount`
- [ ] `RealTxSigner`
- [ ] `RealTxSigningInput`
- [ ] `RealTxSigningResult`
- [ ] `removeRealDevAccount`
- [x] `resolveHardkasAccount`
- [x] `resolveHardkasAccountAddress`
- [x] `resolveRealAccountOrAddress`
- [ ] `saveRealAccountStore`
- [x] `signTxPlanArtifact`
- [ ] `SignTxPlanInput`
- [ ] `SignTxPlanResult`
- [ ] `SimulatedSigner`
- [ ] `StaticSignatureScriptAuthorizer`
- [ ] `TxInputAuthorizationContext`
- [ ] `TxInputAuthorizer`
- [ ] `UnsupportedKaspaKeyGenerator`
- [ ] `UnsupportedRealKaspaSigner`
- [ ] `UnsupportedRealTxSigner`
- [ ] `validateAccountName`
- [ ] `validateAddressNetwork`
- [ ] `validateAddressPrefix`
- [ ] `WalletArtifact`
- [ ] `WalletClaims`
- [ ] `WalletCreateRequest`
- [ ] `WalletImportRequest`
- [x] `WalletManager`
- [ ] `WalletManagerImpl`
- [ ] `WalletMetadata`
- [ ] `WalletState`
- [x] `WalletStateStoreJson`
- [ ] `WalletStateStoreOptions`
- [ ] `WasmInputSigner`
- [ ] `WasmProviderConfig`
- [ ] `withKeystoreLock`

### `@hardkas/artifacts`

253 simbolos, 85 ejercitados (33.6%).

- [ ] `AccountRefSchema`
- [ ] `AddressObservationArtifact`
- [ ] `AddressObservationSchema`
- [ ] `AnyExecutionMode`
- [x] `ARTIFACT_SCHEMAS`
- [x] `ARTIFACT_VERSION`
- [ ] `ArtifactDiff`
- [ ] `ArtifactEntry`
- [ ] `ArtifactExplanation`
- [ ] `ArtifactIndexOptions`
- [ ] `ArtifactIndexQuery`
- [x] `ArtifactIndexStoreJson`
- [ ] `ArtifactLineageSchema`
- [ ] `ArtifactLookup`
- [ ] `ArtifactPayload`
- [ ] `ArtifactType`
- [ ] `ArtifactTypes`
- [ ] `ArtifactValidationResult`
- [ ] `ArtifactVerificationResult`
- [ ] `assertDecimalBigIntString`
- [ ] `assertEvmAddress`
- [ ] `assertEvmTxHash`
- [ ] `assertHexData`
- [x] `assertKnownArtifactType`
- [x] `assertValidIgraSignedTxArtifact`
- [x] `assertValidIgraTxPlanArtifact`
- [x] `assertValidIgraTxReceiptArtifact`
- [ ] `assertValidSignedTxArtifact`
- [ ] `assertValidTxPlanArtifact`
- [ ] `assertValidTxReceiptArtifact`
- [x] `Assumption`
- [ ] `AssumptionArtifact`
- [ ] `AssumptionLevel`
- [ ] `AssumptionSchema`
- [ ] `BaseArtifact`
- [x] `BaseArtifactSchema`
- [x] `BasicCorrelationInvariant`
- [ ] `BasicLineageInvariant`
- [ ] `bigIntReplacer`
- [x] `calculateContentHash`
- [ ] `canMigrate`
- [x] `canonicalStringify`
- [x] `Clock`
- [ ] `CovenantBindingArtifact`
- [ ] `CovenantSchema`
- [x] `createDeploymentRecord`
- [x] `createIgraDeployPlanId`
- [x] `createIgraPlanId`
- [x] `createIgraSignedId`
- [x] `createLineageTransition`
- [x] `createPaymentReceipt`
- [x] `createSimulatedSignedTxArtifact`
- [ ] `createSimulatedTxReceipt`
- [x] `createTxPlanArtifact`
- [ ] `CreateTxPlanArtifactOptions`
- [x] `CURRENT_HASH_VERSION`
- [ ] `DagContext`
- [ ] `DagContextSchema`
- [ ] `defaultClock`
- [x] `deleteDeployment`
- [ ] `DeploymentIndex`
- [ ] `DeploymentRecord`
- [ ] `DeploymentSummary`
- [x] `describeArtifactType`
- [ ] `detectArtifactVersion`
- [ ] `diffArtifacts`
- [ ] `DiffEntry`
- [ ] `DraftArtifact`
- [x] `EvidenceBatchExporter`
- [ ] `EvidenceBatchExportFromIndexOptions`
- [ ] `EvidenceBatchExportOptions`
- [ ] `EvidencePackage`
- [ ] `EvidencePackageSchema`
- [ ] `explainArtifact`
- [ ] `ExternalHardkasSigner`
- [ ] `FeeAuditResult`
- [ ] `formatSignedTxArtifact`
- [ ] `formatTxPlanArtifact`
- [ ] `formatTxReceiptArtifact`
- [x] `generateMigrationReceipt`
- [x] `getBroadcastableSignedTransaction`
- [ ] `getDefaultL2ReceiptsDir`
- [ ] `getDefaultReceiptPath`
- [x] `getL2ReceiptPath`
- [ ] `getMigrationPath`
- [ ] `getRegisteredMigrationSteps`
- [x] `HARDKAS_VERSION`
- [ ] `HardkasArtifactBase`
- [ ] `HardkasArtifactMode`
- [ ] `HardkasArtifactSchema`
- [ ] `HardkasSchema`
- [x] `HardkasSchemas`
- [x] `HashInvariant`
- [x] `IgraSignedTxArtifact`
- [ ] `IgraStatusSchema`
- [x] `IgraTxPlanArtifact`
- [x] `IgraTxReceiptArtifact`
- [ ] `IgraTxRequestArtifact`
- [x] `Invariant`
- [ ] `InvariantContext`
- [ ] `InvariantViolation`
- [x] `InvariantWatcher`
- [ ] `isIgraTxPlanArtifact`
- [x] `isKnownArtifactType`
- [ ] `LegacyExecutionMode`
- [ ] `LifecycleInvariant`
- [ ] `LineageOptions`
- [ ] `LineageValidationResult`
- [ ] `listDeployments`
- [x] `listIgraTxReceiptArtifacts`
- [x] `loadDeployment`
- [x] `loadIgraTxReceiptArtifact`
- [ ] `LocalnetUtxoSchemaV2`
- [x] `migrateArtifactPayload`
- [x] `migrateToCanonical`
- [ ] `MigrationReceipt`
- [ ] `MigrationReceiptArtifact`
- [ ] `MigrationReceiptSchema`
- [x] `MigrationRequiredError`
- [ ] `MigrationResult`
- [ ] `MigrationStep`
- [ ] `NetworkInvariant`
- [x] `NetworkProfile`
- [ ] `NetworkProfileArtifact`
- [ ] `NetworkProfileSchema`
- [ ] `ObservedTransaction`
- [ ] `ObservedTransactionSchema`
- [ ] `ObservedUtxo`
- [ ] `ObservedUtxoSchema`
- [ ] `PaymentReceiptArtifactV1`
- [ ] `PaymentReceiptCreateRequest`
- [x] `Policy`
- [ ] `PolicyArtifact`
- [ ] `PolicySchema`
- [ ] `ProgrammabilityAppPlanArtifact`
- [ ] `ProgrammabilityAppPlanSchema`
- [ ] `ProgrammabilityAppPlanSchemaType`
- [ ] `ProgrammabilityCapabilitiesArtifact`
- [ ] `ProgrammabilityCapabilitiesSchema`
- [ ] `ProgrammabilityCapabilitiesSchemaType`
- [ ] `ProgrammabilityClaims`
- [ ] `ProgrammabilityClaimsSchema`
- [ ] `ProgrammabilityClaimsSchemaType`
- [ ] `ProgrammabilityCorpusReportArtifact`
- [ ] `ProgrammabilityCorpusReportSchema`
- [ ] `ProgrammabilityCorpusReportSchemaType`
- [ ] `ProgrammabilityInspectArtifact`
- [ ] `ProgrammabilityInspectSchema`
- [ ] `ProgrammabilityInspectSchemaType`
- [ ] `ProgrammabilityVerifyArtifact`
- [ ] `ProgrammabilityVerifySchema`
- [ ] `ProgrammabilityVerifySchemaType`
- [x] `ProjectArtifactStore`
- [x] `readArtifact`
- [ ] `readSignedTxArtifact`
- [ ] `readTxPlanArtifact`
- [ ] `readTxReceiptArtifact`
- [x] `recomputeMass`
- [ ] `registerMigrationStep`
- [ ] `ReplayInvariant`
- [ ] `RuntimeSession`
- [ ] `RuntimeSessionSchema`
- [ ] `saveDeployment`
- [x] `saveIgraTxReceiptArtifact`
- [ ] `ScenarioResult`
- [ ] `ScenarioResultSchema`
- [x] `SchemaInvariant`
- [ ] `SchemaMetadata`
- [ ] `ScriptCapability`
- [ ] `ScriptCapabilitySchema`
- [ ] `ScriptMetadataSchema`
- [x] `SEMANTIC_EXCLUSIONS`
- [ ] `SignatureEntrySchema`
- [ ] `SignatureMetadataEntrySchema`
- [x] `SignedTx`
- [x] `SignedTxArtifact`
- [ ] `SignedTxArtifactV1`
- [ ] `SignedTxArtifactV2`
- [x] `SignedTxSchema`
- [ ] `SignedTxSchemaV2`
- [ ] `SilverCompileArtifact`
- [ ] `SilverCompileArtifactSchema`
- [ ] `SilverDeployArtifact`
- [ ] `SilverDeployArtifactSchema`
- [ ] `SilverDeployPlanArtifact`
- [ ] `SilverDeployPlanArtifactSchema`
- [ ] `SilverDeploySimulationArtifact`
- [x] `SilverDeploySimulationArtifactSchema`
- [ ] `SilverScriptArgSchema`
- [ ] `SilverSpendPlanArtifact`
- [ ] `SilverSpendPlanArtifactSchema`
- [ ] `SilverSpendReceiptArtifact`
- [ ] `SilverSpendReceiptArtifactSchema`
- [ ] `SilverSpendSimulationArtifact`
- [x] `SilverSpendSimulationArtifactSchema`
- [ ] `SilverTestArtifact`
- [ ] `SilverTestArtifactSchema`
- [x] `Snapshot`
- [ ] `SnapshotArtifact`
- [ ] `SnapshotSchema`
- [x] `sortUtxosByOutpoint`
- [ ] `STRICT_PATH_KEYS`
- [ ] `ToccataCapabilitiesSchema`
- [ ] `ToccataProgrammabilityCorpusSchema`
- [ ] `ToccataProgrammabilityCorpusSchemaType`
- [x] `TxOutputArtifact`
- [x] `txOutputFromArtifact`
- [x] `txOutputToArtifact`
- [x] `TxPlan`
- [x] `TxPlanArtifact`
- [x] `TxPlanArtifactV1`
- [ ] `TxPlanArtifactV2`
- [x] `TxPlanSchema`
- [ ] `TxPlanSchemaV2`
- [x] `TxReceipt`
- [ ] `TxReceiptArtifact`
- [ ] `TxReceiptArtifactV1`
- [ ] `TxReceiptArtifactV2`
- [x] `TxReceiptSchema`
- [ ] `TxReceiptSchemaV2`
- [ ] `TxTrace`
- [ ] `TxTraceArtifact`
- [ ] `TxTraceArtifactV1`
- [ ] `TxTraceSchema`
- [ ] `updateDeployment`
- [x] `updateDeploymentStatus`
- [x] `UtxoArtifact`
- [x] `utxoFromArtifact`
- [x] `utxoToArtifact`
- [ ] `V4_SEMANTIC_EXCLUSIONS`
- [ ] `validateArtifact`
- [x] `validateIgraSignedTxArtifact`
- [x] `validateIgraTxPlanArtifact`
- [x] `validateIgraTxReceiptArtifact`
- [x] `validateSignedTxArtifact`
- [x] `validateTxPlanArtifact`
- [ ] `validateTxReceiptArtifact`
- [ ] `VerificationContext`
- [ ] `VerificationIssue`
- [ ] `VerificationSeverity`
- [x] `verifyArtifact`
- [ ] `verifyArtifactFile`
- [x] `verifyArtifactIntegrity`
- [x] `verifyArtifactIntegritySync`
- [ ] `verifyArtifactReplay`
- [x] `verifyArtifactSemantics`
- [x] `verifyFeeSemantics`
- [x] `verifyLineage`
- [ ] `WatcherOptions`
- [x] `Workflow`
- [ ] `WorkflowArtifact`
- [x] `WorkflowSchema`
- [x] `writeArtifact`

### `@hardkas/bridge-local`

12 simbolos, 4 ejercitados (33.3%).

- [x] `BridgeEntryPayload`
- [ ] `BridgeLocalResolutionSource`
- [ ] `BridgePlan`
- [ ] `BridgePlanRequest`
- [x] `deserializeBridgePayload`
- [ ] `MiningResult`
- [ ] `planBridgeEntry`
- [ ] `resolveBridgeLocalContext`
- [ ] `ResolveBridgeOptions`
- [ ] `ResolvedBridgeLocalContext`
- [x] `serializeBridgePayload`
- [x] `simulatePrefixMining`

### `@hardkas/cli`

8 simbolos, 2 ejercitados (25%).

- [ ] `buildHardkasProgram`
- [ ] `defineConfig`
- [ ] `runDashboard`
- [ ] `runDevEnv`
- [x] `runDevInit`
- [ ] `runDevTxSend`
- [ ] `runDoctorNode`
- [x] `runTxFlow`

### `@hardkas/client`

6 simbolos, 0 ejercitados (0%).

- [ ] `createClient`
- [ ] `HardKASClient`
- [ ] `HardKASClientConfig`
- [ ] `HardKASResponse`
- [ ] `HardKASResponseError`
- [ ] `HardKASResponseSuccess`

### `@hardkas/config`

27 simbolos, 10 ejercitados (37%).

- [x] `DEFAULT_HARDKAS_CONFIG`
- [x] `defineHardkasConfig`
- [ ] `ExecutionAwareArtifactConfig`
- [ ] `ExecutionDomain`
- [ ] `ExecutionMode`
- [ ] `HardkasAccountConfig`
- [x] `HardkasConfig`
- [x] `HardkasExecutionTarget`
- [ ] `HardkasIgraTarget`
- [ ] `HardkasKaspaNodeTarget`
- [ ] `HardkasKaspaRpcTarget`
- [ ] `HardkasNetworkName`
- [ ] `HardkasNetworkTarget`
- [ ] `HardkasSimulatedTarget`
- [ ] `HardkasTargetKind`
- [ ] `LoadedHardkasConfig`
- [x] `loadHardkasConfig`
- [ ] `ProviderMode`
- [x] `resolveArtifactTarget`
- [ ] `ResolvedProvider`
- [x] `resolveExecutionTarget`
- [ ] `ResolveExecutionTargetOptions`
- [x] `resolveLegacyArtifactTarget`
- [x] `resolveNewIntentTarget`
- [x] `resolveProvider`
- [ ] `ResolveProviderOptions`
- [ ] `validateHardkasConfig`

### `@hardkas/core`

221 simbolos, 77 ejercitados (34.8%).

- [ ] `AccountExecutionModeMismatchError`
- [x] `AccountNetworkMismatchError`
- [x] `acquireLock`
- [ ] `AcquireLockArgs`
- [ ] `AnomalyEvent`
- [ ] `AnomalyType`
- [x] `AppendCoordinator`
- [ ] `ArtifactId`
- [ ] `ArtifactStatus`
- [ ] `ArtifactType`
- [ ] `ArtifactTypes`
- [ ] `artifactTypeSchema`
- [ ] `ArtifactTypeSchema`
- [ ] `ArtifactWrittenContext`
- [x] `asArtifactId`
- [ ] `asContentHash`
- [x] `asCorrelationId`
- [x] `asDaaScore`
- [x] `asEventId`
- [x] `asEventSequence`
- [x] `asKaspaAddress`
- [ ] `asLineageId`
- [x] `asNetworkId`
- [ ] `asRpcEndpointId`
- [ ] `assertAccountCompatibleWithTarget`
- [ ] `assertArtifactAccountCompatibility`
- [x] `assertArtifactCompatibleWithTarget`
- [ ] `assertExecutionCompatibility`
- [x] `assertKnownArtifactType`
- [x] `assertNoSemanticDrift`
- [ ] `assertReceiptCompatibleWithTarget`
- [x] `asTxId`
- [x] `asWorkflowId`
- [ ] `attachLedgerAppender`
- [ ] `BackendPlugin`
- [ ] `BaseHookContext`
- [ ] `BeforeArtifactWriteContext`
- [ ] `BeforeTxSendContext`
- [ ] `BeforeTxSignContext`
- [ ] `Brand`
- [x] `Branded`
- [ ] `classifyArtifactStatus`
- [x] `classifyExecutionCompatibility`
- [ ] `clearLock`
- [ ] `comparePrePostMigrationLineage`
- [ ] `ComputeGrams`
- [ ] `ConfirmationPolicyRequest`
- [ ] `ConfirmationPolicyResult`
- [ ] `ContentHash`
- [ ] `CoreEvent`
- [ ] `CoreEventListener`
- [x] `coreEvents`
- [ ] `CorrelationId`
- [ ] `CorruptionCode`
- [ ] `CorruptionIssue`
- [ ] `CorruptionSeverity`
- [x] `createEventEnvelope`
- [x] `createKaspaP2shBlake2bLock`
- [x] `createPushOnlySignatureScript`
- [x] `createRedeemScriptHash`
- [ ] `createSnapshot`
- [ ] `CreateSnapshotOptions`
- [ ] `CrossWorldAccountCollisionError`
- [ ] `CrossWorldCompatibilityError`
- [ ] `CURRENT_RUNTIME_VERSION`
- [x] `DaaScore`
- [x] `describeArtifactType`
- [ ] `detectSemanticDrift`
- [ ] `DeterministicClock`
- [x] `deterministicCompare`
- [ ] `DeterministicDiff`
- [ ] `DeterministicRandom`
- [ ] `diffReplays`
- [ ] `EnvironmentTelemetry`
- [ ] `EventDomain`
- [x] `EventEnvelope`
- [ ] `EventId`
- [ ] `EventKind`
- [ ] `EventPayloadByKind`
- [ ] `EventSequence`
- [ ] `EventSubscribeOptions`
- [x] `EventSubscriber`
- [ ] `ExecutionAwareAccount`
- [ ] `ExecutionAwareArtifact`
- [ ] `ExecutionAwareReceipt`
- [ ] `ExecutionCompatibility`
- [ ] `ExecutionCompatibilityInput`
- [ ] `ExecutionCompatibilityUndefinedError`
- [ ] `ExecutionDomain`
- [ ] `ExecutionDomainMismatchError`
- [ ] `executionDomainSchema`
- [ ] `ExecutionMode`
- [x] `ExecutionModeMismatchError`
- [ ] `executionModeSchema`
- [ ] `ExecutionModeSchema`
- [ ] `ExecutionNetworkMismatchError`
- [ ] `ExecutionOperation`
- [ ] `ExecutionTargetConflictError`
- [x] `ExecutionTargetUnresolvedError`
- [ ] `formatCorruptionIssue`
- [x] `formatSignedSompiToKas`
- [x] `formatSompiToKas`
- [x] `getCoinbaseMaturity`
- [ ] `getNetworkPrefix`
- [x] `getRequiredConfirmations`
- [x] `getTelemetry`
- [x] `globalTelemetry`
- [x] `HardkasConfig`
- [ ] `hardkasConfigSchema`
- [x] `HardkasError`
- [x] `HardkasExecutionTarget`
- [ ] `hardkasExecutionTargetSchema`
- [ ] `HardkasPlugin`
- [ ] `HardkasPluginHooks`
- [ ] `HardkasSchema`
- [x] `HardkasSchemas`
- [ ] `IdProvider`
- [ ] `InputSignatureRequirement`
- [ ] `IntegrityStatus`
- [ ] `InvariantDomain`
- [ ] `InvariantSeverity`
- [ ] `InvariantViolationError`
- [x] `isKnownArtifactType`
- [x] `isProcessAlive`
- [ ] `KaspaAddress`
- [ ] `kaspaNetworkIdSchema`
- [ ] `LayeredReplayDiff`
- [x] `LegacyArtifactRequiresExplicitResolutionError`
- [x] `LegacyExecutionContextRequiredError`
- [ ] `LineageId`
- [ ] `listLocks`
- [x] `LOCK_ORDER`
- [ ] `LockHandle`
- [ ] `LockMetadata`
- [x] `maskSecrets`
- [ ] `migrateArtifact`
- [ ] `MigrationManager`
- [ ] `MigrationResult`
- [ ] `MigrationStatus`
- [ ] `MIN_SUPPORTED_VERSION`
- [ ] `MismatchMetadata`
- [x] `NetworkId`
- [ ] `NetworkIdSchema`
- [ ] `parseHardkasConfig`
- [x] `parseKasToSompi`
- [x] `PortableSigningPayload`
- [x] `PortableSigningSession`
- [x] `PsktAdapterAlreadyRegisteredError`
- [ ] `PsktAdapterError`
- [ ] `PsktAdapterKind`
- [x] `PsktAdapterMismatchError`
- [ ] `PsktAdapterProtocolError`
- [ ] `PsktAdapterTimeoutError`
- [x] `PsktAdapterTrustProfile`
- [ ] `PsktAdapterUnavailableError`
- [x] `PsktCapabilitiesChangedError`
- [ ] `PsktEncoding`
- [x] `PsktInspection`
- [ ] `PsktOperation`
- [x] `PsktOperationUnsupportedError`
- [ ] `PsktPayloadRejectedError`
- [x] `PsktRuntimeAdapter`
- [ ] `PsktRuntimeBinding`
- [x] `PsktRuntimeBindingNotFoundError`
- [x] `PsktRuntimeCapabilities`
- [x] `PsktSignRequest`
- [ ] `PsktUnsignedTransactionMismatchError`
- [ ] `readSnapshotManifest`
- [ ] `redactSecret`
- [ ] `ReplayContext`
- [x] `resolveCanonicalArtifact`
- [ ] `resolveLineage`
- [ ] `RiskProfile`
- [ ] `RotationResult`
- [ ] `RpcEndpointId`
- [x] `RuntimeContext`
- [ ] `RuntimeNoiseDiff`
- [ ] `SchemaMetadata`
- [ ] `SchemaVersion`
- [ ] `SemanticDriftReport`
- [x] `SemanticIdentity`
- [ ] `SessionAttestation`
- [ ] `Severity`
- [ ] `sha256hex`
- [ ] `SigningParticipant`
- [ ] `SigningSessionState`
- [ ] `SnapshotManifest`
- [x] `SOMPI_PER_KAS`
- [ ] `StampedEvent`
- [ ] `StateProvenance`
- [ ] `StructuralDiff`
- [x] `systemRuntimeContext`
- [ ] `task`
- [ ] `TaskBuilder`
- [ ] `TaskDefinition`
- [x] `telemetryContextStorage`
- [x] `TelemetryManager`
- [ ] `TelemetryRotator`
- [ ] `TelemetrySubsystem`
- [ ] `TxId`
- [ ] `TxSentContext`
- [ ] `TxSignedContext`
- [x] `types`
- [ ] `UnknownEventPayload`
- [x] `UTXO`
- [ ] `UTXORef`
- [ ] `UtxoSetNotStableError`
- [ ] `UtxoVirtualStateUnstableError`
- [x] `validateEventEnvelope`
- [x] `validateStatusTransition`
- [x] `verifyArtifactIntegrity`
- [ ] `verifyCapabilityBoundary`
- [ ] `verifyMigrationIntegrity`
- [ ] `verifyProjectionFreshness`
- [x] `verifyReplay`
- [x] `withLock`
- [x] `withLocks`
- [x] `WorkflowId`
- [x] `writeFileAtomic`
- [ ] `WriteFileAtomicOptions`
- [x] `writeFileAtomicSync`

### `@hardkas/dev-server`

11 simbolos, 5 ejercitados (45.5%).

- [x] `createDevServer`
- [ ] `DevServerConfig`
- [x] `devServerEmitter`
- [ ] `disconnectQueryBackend`
- [ ] `getQueryBackend`
- [x] `resolveCorsOrigin`
- [x] `startHardkasWatcher`
- [ ] `startWatcherReconciliationSweep`
- [x] `stopHardkasWatcher`
- [ ] `stopWatcherReconciliationSweep`
- [ ] `streamRoutes`

### `@hardkas/escrow`

6 simbolos, 1 ejercitados (16.7%).

- [ ] `buildResolutionTx`
- [x] `createEscrow`
- [ ] `EscrowArtifact`
- [ ] `EscrowConfig`
- [ ] `EscrowParticipant`
- [ ] `EscrowState`

### `@hardkas/jobs`

15 simbolos, 2 ejercitados (13.3%).

- [ ] `BatchCursor`
- [ ] `JobCheckpoint`
- [ ] `JobContext`
- [ ] `JobHandler`
- [ ] `JobRecord`
- [x] `JobRunner`
- [ ] `JobRunnerOptions`
- [ ] `JobStatus`
- [ ] `JobStore`
- [x] `JobStoreJson`
- [ ] `JobStoreOptions`
- [ ] `ProgressReporter`
- [ ] `ProgressUpdate`
- [ ] `RetryPolicy`
- [ ] `RetryPolicyOptions`

### `@hardkas/kaspa-rpc`

113 simbolos, 33 ejercitados (29.2%).

- [ ] `BlockDagInfo`
- [x] `calculateConfidence`
- [x] `checkKaspaRpcHealth`
- [ ] `CircuitBreakerOptions`
- [x] `CircuitState`
- [x] `classifyRpcError`
- [x] `CoverageEngine`
- [ ] `GetBlockCountResponse`
- [ ] `GetBlockRequest`
- [ ] `GetBlockResponse`
- [ ] `GetBlocksRequest`
- [ ] `GetBlocksResponse`
- [ ] `GetCoinSupplyResponse`
- [ ] `GetCurrentNetworkResponse`
- [ ] `GetHeadersRequest`
- [ ] `GetHeadersResponse`
- [ ] `GetMempoolEntriesByAddressesRequest`
- [ ] `GetMempoolEntriesByAddressesResponse`
- [ ] `GetMempoolEntriesRequest`
- [ ] `GetMempoolEntriesResponse`
- [ ] `GetMempoolEntryRequest`
- [ ] `GetMempoolEntryResponse`
- [ ] `GetSelectedTipHashResponse`
- [ ] `GetSyncStatusResponse`
- [ ] `GetVirtualChainFromBlockRequest`
- [ ] `GetVirtualChainFromBlockResponse`
- [ ] `GetVirtualChainFromBlockV2Request`
- [ ] `GetVirtualChainFromBlockV2Response`
- [x] `JsonWrpcKaspaClient`
- [ ] `JsonWrpcKaspaClientOptions`
- [x] `JsonWrpcTransport`
- [ ] `JsonWrpcTransportOptions`
- [ ] `KaspaAddressBalance`
- [x] `KaspaJsonRpcClient`
- [ ] `KaspaNodeInfo`
- [x] `KaspaRpcClient`
- [ ] `KaspaRpcCovenantBinding`
- [ ] `KaspaRpcHealth`
- [ ] `KaspaRpcOutpoint`
- [ ] `KaspaRpcTransaction`
- [ ] `KaspaRpcTransactionInput`
- [ ] `KaspaRpcTransactionOutput`
- [ ] `KaspaRpcUtxo`
- [ ] `KaspaSubmitTransactionResult`
- [ ] `KaspaSubscription`
- [x] `KaspaWrpcClient`
- [x] `LoadBalancedRpcProvider`
- [ ] `LoadBalancerOptions`
- [x] `mapKaspaAddressBalance`
- [x] `mapKaspaNodeInfo`
- [x] `mapKaspaRpcUtxos`
- [ ] `mapKaspaSubmitTransactionResult`
- [ ] `MempoolEntry`
- [x] `MempoolError`
- [x] `MempoolRpcClient`
- [x] `MempoolRpcClientImpl`
- [x] `MockKaspaRpcClient`
- [ ] `normalizeRpcError`
- [ ] `NOTIFY_UTXOS_CHANGED_REQUEST`
- [ ] `NOTIFY_VIRTUAL_CHAIN_CHANGED_REQUEST`
- [x] `PublicApiDeclaration`
- [x] `ReadRpcClient`
- [x] `ReadRpcClientImpl`
- [ ] `ResilienceReport`
- [x] `ResilientSubscriptionClient`
- [ ] `ResilientSubscriptionClientOptions`
- [ ] `RetryOptions`
- [ ] `RpcAcceptedTransactionIds`
- [ ] `RpcBlock`
- [ ] `RpcBlockHeader`
- [ ] `RpcBlockVerboseData`
- [ ] `RpcCategory`
- [ ] `RpcChainBlockAcceptedTransactions`
- [x] `RpcCircuitOpenError`
- [ ] `RpcClientOptions`
- [ ] `RpcConfidence`
- [x] `RpcConnectionError`
- [ ] `RpcCoverageStatus`
- [ ] `RpcDataVerbosityLevel`
- [x] `RpcError`
- [ ] `RpcHealthCheckOptions`
- [ ] `RpcHealthResult`
- [ ] `RpcHealthState`
- [x] `RpcIndexError`
- [ ] `RpcManifestEntry`
- [x] `RpcNotFoundError`
- [x] `RpcOptions`
- [x] `RpcProtocolError`
- [ ] `RpcRateLimitError`
- [ ] `RpcReadinessWaitOptions`
- [ ] `RpcSecurityProfile`
- [x] `RpcTimeoutError`
- [ ] `RpcTrace`
- [x] `RpcTransport`
- [ ] `RpcUnavailableError`
- [x] `RpcValidationError`
- [ ] `RpcVerificationLevel`
- [ ] `RUSTY_KASPA_V2_SNAPSHOT`
- [ ] `ServerInfo`
- [ ] `SnapshotOperation`
- [ ] `STOP_NOTIFYING_UTXOS_CHANGED_REQUEST`
- [ ] `SubmitTransactionOptions`
- [ ] `SubmitTransactionReplacementRequest`
- [ ] `SubmitTransactionReplacementResponse`
- [ ] `SubmitTransactionRequest`
- [ ] `SubmitTransactionResponse`
- [ ] `UTXOS_CHANGED_NOTIFICATION`
- [ ] `UtxosChangedEvent`
- [ ] `VIRTUAL_CHAIN_CHANGED_NOTIFICATION`
- [ ] `VirtualChainChangedEvent`
- [x] `waitForKaspaRpcReady`
- [ ] `WrpcRequest`
- [ ] `WrpcResponse`

### `@hardkas/l2`

39 simbolos, 18 ejercitados (46.2%).

- [x] `assertValidL2BridgeAssumptions`
- [ ] `assertValidL2Profile`
- [x] `BUILTIN_L2_PROFILES`
- [x] `checkEvmRpcHealth`
- [x] `encodeConstructorArgs`
- [ ] `EvmCallRequest`
- [x] `EvmJsonRpcClient`
- [ ] `EvmJsonRpcClientOptions`
- [ ] `EvmRpcHealthResult`
- [ ] `EvmTransactionReceiptSummary`
- [ ] `formatWeiAsEtherLike`
- [x] `generateAddEthereumChainPayload`
- [x] `generateMetaMaskSnippet`
- [x] `getL2BridgeAssumptions`
- [ ] `getL2NetworkProfile`
- [x] `getL2Profile`
- [ ] `IgraTxSigner`
- [ ] `IgraTxSigningInput`
- [ ] `IgraTxSigningResult`
- [ ] `L2BridgeAssumptions`
- [ ] `L2BridgePhase`
- [ ] `L2NetworkProfile`
- [ ] `L2NetworkType`
- [ ] `L2ProfileSource`
- [ ] `L2RiskProfile`
- [ ] `L2SecurityAssumptions`
- [x] `L2UserNetworkConfig`
- [ ] `listL2BridgeAssumptions`
- [x] `listL2Profiles`
- [ ] `MetaMaskChainParams`
- [x] `normalizeEvmTransactionReceipt`
- [x] `resolveL2Profile`
- [ ] `toHexQuantity`
- [x] `UnsupportedIgraTxSigner`
- [x] `validateL2BridgeAssumptions`
- [x] `validateL2Profile`
- [x] `ViemIgraTxSigner`
- [ ] `ViemIgraTxSignerOptions`
- [x] `waitForEvmRpcReady`

### `@hardkas/localnet`

68 simbolos, 44 ejercitados (64.7%).

- [x] `addSimulatedBlock`
- [x] `applySimulatedPayment`
- [x] `applySimulatedPlan`
- [x] `calculateAccountsHash`
- [x] `calculateStateHash`
- [x] `calculateUtxoSetHash`
- [x] `createDeterministicAccounts`
- [x] `createInitialLocalnetState`
- [ ] `CreateInitialStateOptions`
- [x] `createLocalnetSnapshot`
- [x] `createSimulatedDag`
- [ ] `DUST_LIMIT_SOMPI`
- [x] `findBestTip`
- [x] `forkFromNetwork`
- [ ] `ForkOptions`
- [x] `fundAddress`
- [ ] `FundAddressInput`
- [ ] `getAccountBalanceSompi`
- [x] `getAddressBalanceSompi`
- [x] `getDagColoring`
- [ ] `getDefaultLocalnetDir`
- [x] `getDefaultLocalnetStatePath`
- [ ] `getDefaultTracesDir`
- [x] `getSelectedChain`
- [x] `getSimulatedReplaySummary`
- [x] `getSpendableUtxos`
- [ ] `getTracePath`
- [x] `HardkasAccount`
- [ ] `HardkasDevnet`
- [x] `listSimulatedReceipts`
- [x] `listSimulatedTraces`
- [x] `loadLocalnetState`
- [x] `loadOrCreateLocalnetState`
- [x] `loadSimulatedReceipt`
- [x] `loadSimulatedTrace`
- [ ] `LocalnetAccount`
- [x] `LocalnetSimulatedProvider`
- [x] `LocalnetState`
- [ ] `LocalnetUtxo`
- [x] `moveSink`
- [x] `reconstructStateAtDaa`
- [ ] `ReplayInvariantResult`
- [ ] `ReplayVerificationReport`
- [x] `resetLocalnetState`
- [x] `resolveAccountAddress`
- [x] `resolveAccountAddressFromState`
- [x] `resolveConflictsDeterministically`
- [x] `restoreLocalnetSnapshot`
- [x] `saveLocalnetState`
- [x] `saveSimulatedReceipt`
- [x] `saveSimulatedTrace`
- [x] `SimulatedBlock`
- [ ] `SimulatedDag`
- [ ] `SimulatedKaspaChain`
- [ ] `SimulatedPaymentInput`
- [ ] `SimulatedReplaySummary`
- [ ] `SimulatedUtxo`
- [ ] `SimulationResult`
- [x] `Snapshot`
- [ ] `SnapshotRestoreResult`
- [ ] `SnapshotVerificationResult`
- [ ] `startSimulatedDevnet`
- [ ] `StateTransition`
- [x] `StoredSimulatedTxReceipt`
- [x] `StoredSimulatedTxTrace`
- [ ] `StoredTraceEvent`
- [x] `verifyReplay`
- [x] `verifySnapshot`

### `@hardkas/node-orchestrator`

15 simbolos, 6 ejercitados (40%).

- [x] `buildKaspadArgs`
- [x] `cleanKaspaNodeData`
- [x] `doctorKaspaNode`
- [x] `findWorkspaceRoot`
- [ ] `getNodeStatus`
- [x] `KaspaNodeConfig`
- [ ] `KaspaNodeDoctorReport`
- [ ] `KaspaNodeHandle`
- [ ] `KaspaNodeRuntimeConfig`
- [ ] `KaspaNodeStatus`
- [ ] `KaspaRealNetwork`
- [ ] `readKaspaNodeLogs`
- [x] `resolveRuntimeConfig`
- [ ] `startKaspaNode`
- [ ] `stopKaspaNode`

### `@hardkas/node-runner`

9 simbolos, 1 ejercitados (11.1%).

- [ ] `DEFAULT_CONTAINER_NAME`
- [ ] `DEFAULT_IMAGE`
- [ ] `DEFAULT_NETWORK`
- [ ] `DEFAULT_PORTS`
- [ ] `DockerKaspadOptions`
- [x] `DockerKaspadRunner`
- [ ] `KaspadNetwork`
- [ ] `KaspadNodeStatus`
- [ ] `KaspadPorts`

### `@hardkas/observability`

20 simbolos, 2 ejercitados (10%).

- [ ] `createLogger`
- [ ] `createMetricRegistry`
- [ ] `createTracer`
- [ ] `getHealthSnapshot`
- [ ] `HealthSnapshot`
- [ ] `LogEntry`
- [ ] `Logger`
- [x] `logger`
- [ ] `LoggerOptions`
- [ ] `LogLevel`
- [ ] `MetricDefinition`
- [ ] `MetricLabels`
- [ ] `MetricRecord`
- [ ] `MetricRegistry`
- [x] `metrics`
- [ ] `MetricType`
- [ ] `Span`
- [ ] `toPrometheusText`
- [ ] `tracer`
- [ ] `Tracer`

### `@hardkas/plugin-local-indexer`

3 simbolos, 0 ejercitados (0%).

- [ ] `LocalIndexerApi`
- [ ] `LocalIndexerOptions`
- [ ] `localIndexerPlugin`

### `@hardkas/plugin-rpc-backend`

9 simbolos, 4 ejercitados (44.4%).

- [x] `HardkasRpcConnectionError`
- [x] `HardkasRpcSemanticError`
- [x] `HardkasRpcTimeoutError`
- [ ] `KaspaRpcBackendOptions`
- [ ] `kaspaRpcBackendPlugin`
- [ ] `KaspaRpcBackendPlugin`
- [x] `ResilienceEngine`
- [ ] `RpcResilienceOptions`
- [ ] `RpcStats`

### `@hardkas/query`

78 simbolos, 30 ejercitados (38.5%).

- [ ] `ArtifactDiffEntry`
- [ ] `ArtifactDiffResult`
- [ ] `ArtifactInspectResult`
- [ ] `ArtifactOp`
- [ ] `ArtifactQueryAdapter`
- [x] `ArtifactQueryItem`
- [ ] `CausalStep`
- [x] `checkPaymentStatus`
- [x] `computeQueryHash`
- [ ] `createExplainBlock`
- [x] `createQueryRequest`
- [ ] `DagAnomaly`
- [ ] `DagConflict`
- [ ] `DagDisplacement`
- [ ] `DagOp`
- [x] `DagQueryAdapter`
- [ ] `DagSinkPath`
- [ ] `DagSinkPathNode`
- [ ] `DagTxHistory`
- [ ] `DegradedResult`
- [ ] `DivergenceKind`
- [x] `evaluateFilter`
- [x] `evaluateFilters`
- [ ] `EventsOp`
- [x] `EventsQueryAdapter`
- [ ] `EvidenceRef`
- [x] `ExplainBlock`
- [x] `explainIntegrity`
- [x] `explainOrphan`
- [x] `explainTransition`
- [ ] `FilterOp`
- [x] `formatExplainBlock`
- [ ] `FormatResultOptions`
- [x] `formatWhyBlock`
- [ ] `GetBalanceResult`
- [ ] `GetHistoryResult`
- [ ] `GetUtxosResult`
- [ ] `LineageChainResult`
- [x] `LineageNode`
- [ ] `LineageOp`
- [ ] `LineageOrphan`
- [ ] `LineageQueryAdapter`
- [x] `LineageTransition`
- [x] `paginateAndFormatResult`
- [ ] `PaymentCheckRequest`
- [ ] `PaymentCheckResult`
- [ ] `PaymentStatus`
- [ ] `QueryAdapter`
- [ ] `QueryAnnotations`
- [x] `QueryBackendInitializationError`
- [x] `QueryBackendLoader`
- [ ] `QueryBackendMode`
- [ ] `QueryBackendSelection`
- [ ] `QueryDomain`
- [x] `QueryEngine`
- [x] `QueryEngineOptions`
- [ ] `QueryFilter`
- [x] `QueryRequest`
- [ ] `QueryResult`
- [ ] `QuerySort`
- [ ] `QueryStoreStatus`
- [ ] `ReplayDivergence`
- [ ] `ReplayInvariantsResult`
- [ ] `ReplayOp`
- [x] `ReplayQueryAdapter`
- [ ] `ReplaySummaryResult`
- [x] `resolveFieldPath`
- [x] `serializeQueryResult`
- [ ] `TxOp`
- [x] `TxQueryAdapter`
- [x] `Utxo`
- [ ] `WalletHistoryItem`
- [ ] `WalletHistoryPage`
- [x] `WalletQuery`
- [ ] `WalletQueryClaims`
- [ ] `WalletQueryOptions`
- [x] `WalletQueryProvider`
- [x] `WhyBlock`

### `@hardkas/query-store`

29 simbolos, 7 ejercitados (24.1%).

- [ ] `ArtifactDocument`
- [ ] `ArtifactRow`
- [ ] `attachLedgerAppender`
- [ ] `classifySqlSafety`
- [ ] `DbArtifactRow`
- [ ] `DbEventRow`
- [ ] `DbLineageEdgeRow`
- [ ] `detachLedgerAppender`
- [ ] `DoctorReport`
- [ ] `DomainStoreJson`
- [ ] `DomainStoreJsonOptions`
- [ ] `EventDocument`
- [x] `HardkasIndexer`
- [x] `HardkasStore`
- [ ] `IndexerOptions`
- [ ] `LedgerAppenderOptions`
- [ ] `LineageEdgeDocument`
- [ ] `MetadataRow`
- [x] `Migration`
- [ ] `MigrationHistoryEntry`
- [x] `MigrationRunner`
- [ ] `MIGRATIONS`
- [x] `ProjectionStoreJson`
- [ ] `ProjectionStoreOptions`
- [ ] `QueryBackend`
- [x] `SCHEMA_VERSION`
- [x] `SqliteQueryBackend`
- [ ] `SyncResult`
- [ ] `SyncStats`

### `@hardkas/react`

7 simbolos, 0 ejercitados (0%).

- [ ] `HardKASProvider`
- [ ] `HardKASProviderProps`
- [ ] `useHardKAS`
- [ ] `useMutation`
- [ ] `useQuery`
- [ ] `UseQueryOptions`
- [ ] `useWallet`

### `@hardkas/rpc-events`

27 simbolos, 4 ejercitados (14.8%).

- [ ] `AcceptedTransactionIds`
- [ ] `BackoffConfig`
- [ ] `BlockAddedEvent`
- [ ] `ConnectionStateChangedEvent`
- [ ] `ConnectionStatus`
- [x] `DefaultReactiveEventProvider`
- [ ] `DeterministicBackoff`
- [x] `EventEnvelope`
- [ ] `EventHandler`
- [ ] `EventMap`
- [ ] `EventMetadata`
- [ ] `EventType`
- [ ] `ReactiveEventProvider`
- [ ] `ReconciliationEngine`
- [x] `SimulatedTransportAdapter`
- [x] `Subscription`
- [ ] `SubscriptionManager`
- [ ] `SubscriptionRequest`
- [ ] `TransactionAcceptanceChangedEvent`
- [ ] `TransactionFinalityChangedEvent`
- [ ] `TransactionObservedEvent`
- [ ] `TransportAdapter`
- [ ] `TransportCapabilities`
- [ ] `TransportSubscription`
- [ ] `TransportSubscriptionRequest`
- [ ] `UtxoChangedEvent`
- [ ] `VirtualChainChangedEvent`

### `@hardkas/sdk`

118 simbolos, 44 ejercitados (37.3%).

- [x] `adapterRegistry`
- [x] `ARTIFACT_SCHEMAS`
- [ ] `ArtifactId`
- [x] `buildPaymentPlan`
- [x] `capabilities`
- [ ] `ClientEnvelope`
- [x] `computeCapabilitiesHash`
- [x] `computeIntegrityHash`
- [x] `computePayloadHash`
- [x] `computeSessionId`
- [ ] `CorpusIssue`
- [ ] `CorpusVerifyResult`
- [ ] `createHardkasCapabilities`
- [x] `createHardkasClient`
- [ ] `createHardkasEnvironment`
- [ ] `createProgrammabilityCapabilities`
- [x] `createSession`
- [x] `createSessionRevision`
- [x] `createTxPlanArtifact`
- [ ] `createVprogsCapabilities`
- [ ] `createVprogsStatus`
- [ ] `createZkCapabilities`
- [x] `defineHardkasConfig`
- [ ] `defineTask`
- [x] `deserializeSession`
- [x] `EvidenceManager`
- [ ] `EvidencePackOptions`
- [ ] `EvidenceVerifyResult`
- [x] `exportSession`
- [ ] `extractSession`
- [x] `finalizeSession`
- [x] `formatSompiToKas`
- [ ] `FundDevWalletsOptions`
- [x] `Hardkas`
- [x] `HARDKAS_VERSION`
- [ ] `HardkasAccounts`
- [ ] `HardkasArtifactsManager`
- [ ] `HardkasCapabilities`
- [x] `HardkasCapabilitiesApi`
- [ ] `HardkasClientOptions`
- [x] `HardkasCorpus`
- [ ] `HardkasCovenants`
- [ ] `HardkasEnvironment`
- [ ] `HardkasEnvironmentOptions`
- [x] `HardkasError`
- [ ] `HardkasExperimental`
- [x] `HardkasFees`
- [ ] `HardkasIgra`
- [ ] `HardkasL2`
- [ ] `HardkasLineage`
- [ ] `HardkasLocalnet`
- [ ] `HardkasMode`
- [ ] `HardkasOptions`
- [x] `HardkasProgrammability`
- [x] `HardkasQuery`
- [ ] `HardkasReplay`
- [x] `HardkasSilver`
- [ ] `HardkasTx`
- [x] `HardkasVprogs`
- [ ] `HardkasWorkspace`
- [x] `HardkasZk`
- [ ] `inspectVprogsArtifact`
- [ ] `inspectZkProof`
- [ ] `KaspaAddress`
- [ ] `LineageId`
- [x] `mergeSessions`
- [ ] `migrateRuntime`
- [x] `NetworkId`
- [x] `parseKasToSompi`
- [x] `PrivateKeyAuthorizer`
- [ ] `ProgrammabilityAppPlan`
- [ ] `ProgrammabilityCapabilitiesResult`
- [ ] `programmabilityClaims`
- [ ] `ProgrammabilityClaims`
- [ ] `ProgrammabilityCorpusReport`
- [ ] `ProgrammabilityInspectResult`
- [ ] `ProgrammabilityKind`
- [ ] `ProgrammabilityVerifyResult`
- [x] `pskt`
- [x] `registerNativeAdapter`
- [ ] `serializeSession`
- [x] `SignedTxArtifact`
- [ ] `signSession`
- [x] `signTxPlanArtifact`
- [ ] `SilverCompareMode`
- [ ] `SilverCompareOptions`
- [ ] `SilverCompareReport`
- [ ] `SilverCompileOptions`
- [ ] `SilverDeployPlanOptions`
- [x] `SilverScript`
- [ ] `SilverSdkArtifactResult`
- [ ] `SilverSdkWriteOptions`
- [ ] `SilverSpendPlanOptions`
- [x] `SOMPI_PER_KAS`
- [ ] `StaticSignatureScriptAuthorizer`
- [ ] `TaskArgs`
- [ ] `TaskContext`
- [ ] `TxId`
- [ ] `TxInputAuthorizationContext`
- [ ] `TxInputAuthorizer`
- [x] `TxPlanArtifact`
- [ ] `TxReceiptArtifact`
- [ ] `TxTraceArtifact`
- [x] `verifySessionIntegrity`
- [ ] `verifyToccataCorpus`
- [x] `verifyZkCorpus`
- [x] `verifyZkProofLocal`
- [ ] `VprogsCapabilitiesResult`
- [ ] `VprogsClaims`
- [ ] `VprogsInspectResult`
- [ ] `VprogsStatusResult`
- [x] `writeArtifact`
- [ ] `ZkCapabilities`
- [ ] `ZkCorpusVerifyResult`
- [ ] `ZkIssue`
- [ ] `ZkProofInspectResult`
- [ ] `ZkProofSystem`
- [ ] `ZkProofVerifyResult`

### `@hardkas/sessions`

10 simbolos, 7 ejercitados (70%).

- [x] `createSession`
- [x] `getActiveSession`
- [ ] `HardkasSession`
- [x] `loadSessionStore`
- [x] `loadSessionStoreStrict`
- [x] `loadSessionStoreWithDiagnostics`
- [ ] `saveSessionStore`
- [x] `SESSION_FILE`
- [ ] `SessionStore`
- [x] `setActiveSession`

### `@hardkas/simulator`

75 simbolos, 33 ejercitados (44%).

- [x] `ApproxGhostdagEngine`
- [ ] `blockBlueScore`
- [ ] `blockBlueWork`
- [x] `BlockHash`
- [x] `blockHash`
- [ ] `blockParents`
- [ ] `BlueWorkType`
- [x] `calculateSilverArgsHash`
- [ ] `CandidateColor`
- [ ] `compactFromFull`
- [ ] `CompactGhostdagData`
- [x] `compareMassProfiles`
- [x] `compareSortableBlocks`
- [ ] `computeDagMetrics`
- [ ] `createSilverSimulationState`
- [ ] `createTraceId`
- [ ] `DagMetrics`
- [x] `DEFAULT_K`
- [x] `findSelectedParent`
- [x] `formatMassComparison`
- [x] `formatMassProfile`
- [x] `formatScenarioReport`
- [x] `GENESIS_HASH`
- [x] `genesisGhostdagData`
- [x] `GhostdagData`
- [x] `GhostdagStore`
- [x] `headerWork`
- [x] `isDagAncestorOf`
- [ ] `loadMassSnapshot`
- [ ] `MassBreakdown`
- [ ] `MassComparison`
- [ ] `MassSnapshot`
- [ ] `MassSnapshotStore`
- [ ] `orderedMergesetWithoutSelectedParent`
- [ ] `outpointKey`
- [ ] `parsePushOnlyScript`
- [ ] `pastSet`
- [ ] `profileAndCompare`
- [x] `profileMass`
- [x] `runAllScenarios`
- [x] `runDiamondDag`
- [x] `runForkResolution`
- [x] `runLinearChain`
- [x] `runWideDag`
- [ ] `saveMassSnapshot`
- [ ] `ScenarioConfig`
- [ ] `ScenarioResult`
- [ ] `SILVER_SIMULATOR_CREATED_AT`
- [ ] `SILVER_SIMULATOR_FEE_SOMPI`
- [ ] `SILVER_SIMULATOR_VERSION`
- [ ] `SilverArgArtifactLike`
- [x] `SilverDeployPlanArtifactLike`
- [ ] `SilverDeploySimulationReceipt`
- [ ] `SilverDeploySimulationResult`
- [ ] `SilverExpectedOutput`
- [ ] `SilverSimulatedUtxo`
- [x] `SilverSimulationError`
- [ ] `SilverSimulationErrorCode`
- [ ] `SilverSimulationOptions`
- [ ] `SilverSimulationState`
- [ ] `SilverSimulationStatus`
- [x] `SilverSpendPlanArtifactLike`
- [ ] `SilverSpendSimulationReceipt`
- [ ] `SilverSpendSimulationResult`
- [x] `SimBlock`
- [x] `SimBlockHeader`
- [x] `simulateSilverDeploy`
- [x] `simulateSilverSpend`
- [ ] `SimulationResult`
- [x] `SortableBlock`
- [x] `sortBlocks`
- [ ] `TxLifecyclePhase`
- [ ] `TxSimulator`
- [ ] `TxTraceEvent`
- [x] `unorderedMergesetWithoutSelectedParent`

### `@hardkas/simulator-adapters`

2 simbolos, 0 ejercitados (0%).

- [ ] `useBridgeLocalPlan`
- [ ] `useBridgeLocalSimulation`

### `@hardkas/storage-postgres`

5 simbolos, 0 ejercitados (0%).

- [ ] `InvoiceStorePostgres`
- [ ] `JobStorePostgres`
- [ ] `postgresStorage`
- [ ] `PostgresStorage`
- [ ] `PostgresStorageOptions`

### `@hardkas/sync-daemon`

2 simbolos, 1 ejercitados (50%).

- [x] `SyncDaemon`
- [ ] `SyncDaemonOptions`

### `@hardkas/testing`

27 simbolos, 11 ejercitados (40.7%).

- [x] `AdversarialFixtures`
- [x] `clearMassRecords`
- [x] `createFixture`
- [x] `createTestHarness`
- [x] `disableMassTracking`
- [x] `enableMassTracking`
- [x] `expect`
- [ ] `FixtureDefinition`
- [x] `generateReproducibilityReport`
- [ ] `getAllTortureBuckets`
- [x] `getMassRecords`
- [ ] `getTortureBucket`
- [ ] `HardkasFixtureSigner`
- [ ] `hardKasMatchers`
- [ ] `HardKasMatchers`
- [ ] `HarnessConfig`
- [ ] `LcgPrng`
- [ ] `MassRecord`
- [ ] `ReproducibilityReport`
- [x] `scenario`
- [ ] `SendResult`
- [ ] `SimulatedTxPlanSigner`
- [x] `TestHarness`
- [ ] `TortureBucket`
- [ ] `TortureBucketContext`
- [ ] `TortureCaseResult`
- [ ] `TortureInvariantError`

### `@hardkas/toolkit`

59 simbolos, 8 ejercitados (13.6%).

- [x] `calculateDynamicFeeRate`
- [ ] `ConsensusView`
- [ ] `ConsolidationPlan`
- [ ] `DagApi`
- [ ] `DagBlock`
- [ ] `DagNeighborhood`
- [ ] `DagStatistics`
- [ ] `DAGTopology`
- [ ] `DustAnalysis`
- [ ] `DynamicFeeRateResult`
- [ ] `FeePriority`
- [ ] `FsSnapshotBackend`
- [ ] `IndexerBackendPlugin`
- [x] `IndexerToolkit`
- [ ] `IndexerToolkitOptions`
- [ ] `InvoiceRecord`
- [ ] `InvoiceStore`
- [ ] `InvoiceStoreJson`
- [x] `JobsToolkit`
- [ ] `JobsToolkitOptions`
- [ ] `LocalDagStore`
- [ ] `MemorySnapshotBackend`
- [ ] `MergePlan`
- [x] `PaymentToolkit`
- [ ] `PaymentToolkitOptions`
- [ ] `QueryDataSource`
- [ ] `QueryResponse`
- [x] `QueryToolkit`
- [ ] `Recommendation`
- [ ] `SILVER_TEMPLATES`
- [ ] `SilverArtifact`
- [ ] `SilverBuildResult`
- [ ] `SilverClaims`
- [ ] `SilverEvidence`
- [ ] `SilverSimulationResult`
- [ ] `SilverTemplate`
- [x] `SilverToolkit`
- [ ] `SnapshotBackend`
- [ ] `SnapshotManifest`
- [ ] `SnapshotParticipant`
- [ ] `snapshotReplacer`
- [ ] `snapshotReviver`
- [ ] `SnapshotState`
- [x] `SnapshotToolkit`
- [ ] `SnapshotToolkitOptions`
- [ ] `SplitPlan`
- [ ] `SweepPlan`
- [ ] `UtxoControlState`
- [ ] `UtxoControlStore`
- [ ] `UtxoListOpts`
- [ ] `UtxoStatistics`
- [ ] `WalletAnalysis`
- [ ] `WalletSubscriptionEvent`
- [ ] `WalletSubscriptionManager`
- [x] `WalletToolkit`
- [ ] `WalletToolkitOptions`
- [ ] `WalletUtxoApi`
- [ ] `WalletWatchHandler`
- [ ] `WatchHandler`

### `@hardkas/tx-builder`

61 simbolos, 27 ejercitados (44.3%).

- [x] `buildKaspaUri`
- [x] `buildPaymentPlan`
- [x] `buildTransaction`
- [x] `calculateConsensusNonContextualMass`
- [x] `CoinSelectionRequest`
- [ ] `CoinSelectionResult`
- [ ] `CoinSelectionStrategy`
- [ ] `ConsensusMassInput`
- [ ] `ConsensusMassResult`
- [ ] `ConsolidationRequest`
- [ ] `CovenantBindingInput`
- [x] `createMockUtxo`
- [ ] `DEFAULT_MINIMUM_RELAY_RATE_SOMPI_PER_MASS`
- [ ] `DUST_THRESHOLD_SOMPI`
- [ ] `EngineFeePolicy`
- [x] `estimateFee`
- [ ] `estimateFeeFromMass`
- [ ] `estimateMass`
- [x] `estimateToccataFee`
- [x] `estimateTransactionMass`
- [ ] `FeeConvergenceError`
- [ ] `FeeEstimationRequest`
- [ ] `FeeEstimationResult`
- [ ] `FeePolicy`
- [ ] `FlatUtxo`
- [x] `KASPA_CONSENSUS_MASS`
- [x] `KASPA_MASS_CONSTANTS`
- [ ] `KaspaUriRequest`
- [ ] `KaspaUriResult`
- [ ] `MassBreakdown`
- [ ] `MassEstimateResult`
- [x] `MAX_FEE_SELECTION_PASSES`
- [x] `NetworkType`
- [ ] `Outpoint`
- [x] `Output`
- [ ] `PlanTransactionRequest`
- [x] `selectCoins`
- [ ] `SelectionPolicy`
- [ ] `SemanticVerificationIssue`
- [ ] `SemanticVerificationResult`
- [ ] `SemanticVerificationSeverity`
- [ ] `SemanticVerifyContext`
- [x] `Sompi`
- [x] `sompiToKasDisplay`
- [x] `toTxBuilderUtxo`
- [x] `toWalletQueryUtxo`
- [ ] `TransactionContext`
- [x] `TransactionEngineConfig`
- [ ] `TransactionIntent`
- [ ] `TransactionPolicies`
- [ ] `TxBuildRequest`
- [x] `TxOutput`
- [x] `TxPlan`
- [ ] `TxPlanResult`
- [x] `TxPlanService`
- [ ] `TxPlanServiceOptions`
- [x] `Utxo`
- [x] `UtxoProvider`
- [x] `verifySignedTxSemantics`
- [x] `verifyTxPlanSemantics`
- [ ] `verifyTxReceiptSemantics`

### `@hardkas/wallet-adapter`

16 simbolos, 8 ejercitados (50%).

- [ ] `AddressQuery`
- [x] `connectKaspaWallet`
- [ ] `ConnectWalletOptions`
- [x] `detectKaspaWallets`
- [ ] `DevAccountsWalletProvider`
- [x] `InMemoryWalletProvider`
- [x] `KaspaWalletAccount`
- [x] `KaspaWalletAdapter`
- [ ] `SignTransactionRequest`
- [ ] `SignTransactionResult`
- [ ] `TransactionBroadcaster`
- [x] `TransactionSigner`
- [ ] `UtxoQuery`
- [ ] `WalletCapabilities`
- [x] `WalletProvider`
- [x] `WatchOnlyWalletProvider`


