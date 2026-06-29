export interface SchemaMetadata {
  type: string;
  domain: "tx" | "silver" | "zk" | "vprogs" | "programmability" | "corpus" | "infra" | "cli" | "audit";
  version: "v1" | "v2" | "legacy" | string;
  stability: "stable" | "stable-local" | "experimental" | "fixture-coherence" | "inspect-only" | "report";
  legacy?: boolean;
}

export const HardkasSchemas = {
  // --- Tx & Core ---
  Event: "hardkas.event",
  WorkflowIntent: "hardkas.workflow.intent",
  TxPlan: "hardkas.txPlan",
  TxPlanV1: "hardkas.txPlan.v1",
  TxPlanV2: "hardkas.txPlan.v2",
  SignedTx: "hardkas.signedTx",
  SignedTxV1: "hardkas.signedTx.v1",
  TxReceipt: "hardkas.txReceipt",
  TxReceiptV1: "hardkas.txReceipt.v1",
  PaymentReceiptV1: "hardkas.paymentReceipt.v1",
  TxTrace: "hardkas.txTrace",
  TxTraceV1: "hardkas.txTrace.v1",
  Snapshot: "hardkas.snapshot",
  SnapshotV1: "hardkas.snapshot.v1",
  WorkflowV1: "hardkas.workflow.v1",
  PolicyV1: "hardkas.policy.v1",
  AssumptionV1: "hardkas.assumption.v1",
  NetworkProfileV1: "hardkas.networkProfile.v1",
  MigrationReceiptV1: "hardkas.migrationReceipt.v1",
  ErrorV1: "hardkas.error.v1",
  ReplayV1: "hardkas.replay.v1",
  ReplayDiffV1: "hardkas.replayDiff.v1",
  ReplayReportV1: "hardkas.replayReport.v1",
  ReplayVerifyV1: "hardkas.replayVerify.v1",

  // --- Localnet & Realnet Infra ---
  LocalnetStateV1: "hardkas.localnetState.v1",
  LocalnetStatusV1: "hardkas.localnetStatus.v1",
  LocalnetControlV1: "hardkas.localnetControl.v1",
  LocalnetFundingV1: "hardkas.localnetFunding.v1",
  RealAccountStoreV1: "hardkas.realAccountStore.v1",
  EncryptedKeystoreV2: "hardkas.encryptedKeystore.v2",
  NodeStatusV1: "hardkas.nodeStatus.v1",

  // --- Deployment ---
  DeploymentV1: "hardkas.deployment.v1",
  DeploymentIndexV1: "hardkas.deploymentIndex.v1",

  // --- L2 & Igra ---
  IgraTxPlan: "hardkas.igraTxPlan",
  IgraTxPlanV1: "hardkas.igraTxPlan.v1",
  IgraSignedTxV1: "hardkas.igraSignedTx.v1",
  IgraTxReceipt: "hardkas.igraTxReceipt",
  IgraTxReceiptV1: "hardkas.igraTxReceipt.v1",
  L2ProfileV1: "hardkas.l2Profile.v1",
  L2BridgeAssumptionsV1: "hardkas.l2BridgeAssumptions.v1",

  // --- SilverScript ---
  SilverCompile: "hardkas.silver.compile",
  SilverTest: "hardkas.silver.test",
  SilverDeployPlan: "hardkas.silver.deployPlan",
  SilverDeploy: "hardkas.silver.deploy",
  SilverSpendPlan: "hardkas.silver.spendPlan",
  SilverSpendReceipt: "hardkas.silver.spendReceipt",
  SilverDeploySimulation: "hardkas.silver.deploySimulation",
  SilverSpendSimulation: "hardkas.silver.spendSimulation",
  SilverSimulationStateV1: "hardkas.silver.simulationState.v1",

  // --- Programmability Surface ---
  ProgrammabilityCapabilitiesV1: "hardkas.programmability.capabilities.v1",
  ProgrammabilityInspectV1: "hardkas.programmability.inspect.v1",
  ProgrammabilityVerifyV1: "hardkas.programmability.verify.v1",
  ProgrammabilityCorpusReportV1: "hardkas.programmability.corpusReport.v1",
  ProgrammabilityAppPlanV1: "hardkas.programmability.appPlan.v1",
  ProgrammabilitySurfaceCheckV1: "hardkas.programmability.surfaceCheck.v1",
  ProgrammabilityExamplesCheckV1: "hardkas.programmability.examplesCheck.v1",
  ProgrammabilityTemplatesCheckV1: "hardkas.programmability.templatesCheck.v1",

  // --- ZK & vProgs ---
  ZkCapabilitiesV1: "hardkas.zkCapabilities.v1",
  ZkCorpusV1: "hardkas.zkCorpus.v1",
  ZkProofInspectV1: "hardkas.zkProofInspect.v1",
  ZkProofVerificationV1: "hardkas.zkProofVerification.v1",
  ZkCorpusVerificationV1: "hardkas.zkCorpusVerification.v1",
  ZkGroth16FixtureV1: "hardkas.zkGroth16Fixture.v1",
  ZkRisc0FixtureV1: "hardkas.zkRisc0Fixture.v1",
  
  ZkGroth16ProofV1: "hardkas.zk.groth16.proof.v1",
  ZkGroth16PublicInputsV1: "hardkas.zk.groth16.publicInputs.v1",
  ZkGroth16VerificationKeyV1: "hardkas.zk.groth16.verificationKey.v1",
  ZkGroth16VerifierMetadataV1: "hardkas.zk.groth16.verifierMetadata.v1",
  ZkGroth16VerifyReportV1: "hardkas.zk.groth16.verifyReport.v1",
  ZkRisc0ImageIdV1: "hardkas.zk.risc0.imageId.v1",
  ZkRisc0JournalV1: "hardkas.zk.risc0.journal.v1",
  ZkRisc0ReceiptV1: "hardkas.zk.risc0.receipt.v1",
  ZkRisc0VerifyReportV1: "hardkas.zk.risc0.verifyReport.v1",

  VProgsCapabilitiesV1: "hardkas.vprogsCapabilities.v1",
  VProgsInspectV1: "hardkas.vprogsInspect.v1",
  VProgsStatusV1: "hardkas.vprogsStatus.v1",
  VProgsInspectFixtureV1: "hardkas.vprogs.inspectFixture.v1",

  // --- Corpus & Testing ---
  EvidencePackageV1: "hardkas.evidencePackage.v1",
  ScenarioResultV1: "hardkas.scenarioResult.v1",
  ToccataProgrammabilityCorpusV1: "hardkas.toccataProgrammabilityCorpus.v1",
  ToccataGauntletV1: "hardkas.toccataGauntlet.v1",
  ToccataCorpusV1: "hardkas.toccataCorpus.v1",
  ToccataGoldenCompareV1: "hardkas.toccataGoldenCompare.v1",
  ToccataGoldenFailureCaseV1: "hardkas.toccataGoldenFailureCase.v1",
  ToccataGoldenManifestV1: "hardkas.toccataGoldenManifest.v1",
  ToccataGoldenFailureManifestV1: "hardkas.toccataGoldenFailureManifest.v1",

  // --- CLI / Runners / Audits / Reports ---
  PostReleaseProbe: "hardkas.postReleaseProbe",
  CliReferenceV1: "hardkas.cliReference.v1",
  ArtifactV1: "hardkas.artifact.v1",
  ArtifactInspectV1: "hardkas.artifactInspect.v1",
  AuditV1: "hardkas.audit.v1",
  PostReleaseBreakGauntletV1: "hardkas.postReleaseBreakGauntlet.v1",
  KaspaDoctorV1: "hardkas.kaspaDoctor.v1",
  DevDoctorV1: "hardkas.devDoctor.v1",
  DevServerV1: "hardkas.devServer.v1",
  LocalWizardV1: "hardkas.localWizard.v1",
  QueryRebuildV1: "hardkas.queryRebuild.v1",
  QueryVerifyV1: "hardkas.queryVerify.v1",
  SemanticBundleV1: "hardkas.semantic-bundle.v1",
  SessionV1: "hardkas.session.v1",
  SessionV0: "hardkas.session.v0",
  TelemetryV1: "hardkas.telemetry.v1",
  TortureReportV1: "hardkas.tortureReport.v1",
  PruneReportV1: "hardkas.pruneReport.v1",
  LockV1: "hardkas.lock.v1",
  BridgeLocalPlanV1: "hardkas.bridge.localPlan.v1",
  BridgeLocalSimulationV1: "hardkas.bridge.localSimulation.v1",
  KaswareLocalV1: "hardkas.kaswareLocal.v1",
  MetamaskLocalV1: "hardkas.metamaskLocal.v1",

  // Miscellaneous used in docs / examples
  ExampleDocumentAnchorV1: "hardkas.example.documentAnchor.v1"
} as const;

export type HardkasSchema = typeof HardkasSchemas[keyof typeof HardkasSchemas];

/** Alias for compatibility */
export const ArtifactTypes = HardkasSchemas;
export type ArtifactType = HardkasSchema;

const registryValues = new Set(Object.values(HardkasSchemas));

export function isKnownArtifactType(type: string): type is HardkasSchema {
  return registryValues.has(type as HardkasSchema);
}

export function assertKnownArtifactType(type: string): HardkasSchema {
  if (!isKnownArtifactType(type)) {
    throw new Error(`Unknown HardKAS artifact type or schema: ${type}`);
  }
  return type;
}

export function describeArtifactType(type: HardkasSchema): SchemaMetadata {
  assertKnownArtifactType(type);
  const isLegacy = !type.includes(".v") && !type.endsWith("V1");
  return {
    type,
    domain: inferDomain(type),
    version: isLegacy ? "legacy" : type.split(".").pop() || "unknown",
    stability: inferStability(type),
    legacy: isLegacy
  };
}

function inferDomain(type: string): SchemaMetadata["domain"] {
  if (type.includes("silver")) return "silver";
  if (type.includes("zk") || type.includes("groth16") || type.includes("risc0")) return "zk";
  if (type.includes("vprog")) return "vprogs";
  if (type.includes("programmability")) return "programmability";
  if (type.includes("corpus") || type.includes("toccata") || type.includes("toccataGolden") || type.includes("Fixture")) return "corpus";
  if (type.includes("cli") || type.includes("Runner") || type.includes("report") || type.includes("audit") || type.includes("Doctor")) return "audit";
  if (type.includes("tx") || type.includes("snapshot") || type.includes("receipt") || type.includes("policy")) return "tx";
  return "infra";
}

function inferStability(type: string): SchemaMetadata["stability"] {
  if (type.includes("toccataGolden") || type.includes("Fixture")) return "fixture-coherence";
  if (type.includes("Inspect") || type.includes("inspect")) return "inspect-only";
  if (type.includes("Report") || type.includes("report") || type.includes("Audit") || type.includes("audit")) return "report";
  if (type.includes("v1")) return "stable";
  return "stable-local";
}
