import pkg from "../package.json" with { type: "json" };
import { HardkasSchemas, HardkasSchema } from "@hardkas/core";
export const HARDKAS_VERSION = pkg.version;

export const ARTIFACT_SCHEMAS = {
  LOCALNET_STATE: HardkasSchemas.LocalnetStateV1,
  REAL_ACCOUNT_STORE: HardkasSchemas.RealAccountStoreV1,
  TX_PLAN: HardkasSchemas.TxPlan,
  SIGNED_TX: HardkasSchemas.SignedTx,
  TX_RECEIPT: HardkasSchemas.TxReceipt,
  PAYMENT_RECEIPT: HardkasSchemas.PaymentReceiptV1,
  TX_TRACE: HardkasSchemas.TxTrace,
  SNAPSHOT: HardkasSchemas.Snapshot,
  IGRA_TX_PLAN: HardkasSchemas.IgraTxPlanV1,
  IGRA_SIGNED_TX: HardkasSchemas.IgraSignedTxV1,
  IGRA_TX_RECEIPT: HardkasSchemas.IgraTxReceiptV1,
  POLICY: HardkasSchemas.PolicyV1,
  NETWORK_PROFILE: HardkasSchemas.NetworkProfileV1,
  ASSUMPTION: HardkasSchemas.AssumptionV1,
  MIGRATION_RECEIPT: HardkasSchemas.MigrationReceiptV1,
  SILVER_COMPILE: HardkasSchemas.SilverCompile,
  SILVER_TEST: HardkasSchemas.SilverTest,
  SILVER_DEPLOY_PLAN: HardkasSchemas.SilverDeployPlan,
  SILVER_DEPLOY: HardkasSchemas.SilverDeploy,
  SILVER_SPEND_PLAN: HardkasSchemas.SilverSpendPlan,
  SILVER_SPEND_RECEIPT: HardkasSchemas.SilverSpendReceipt,
  SILVER_DEPLOY_SIMULATION: HardkasSchemas.SilverDeploySimulation,
  SILVER_SPEND_SIMULATION: HardkasSchemas.SilverSpendSimulation,
  PROGRAMMABILITY_CAPABILITIES: HardkasSchemas.ProgrammabilityCapabilitiesV1,
  PROGRAMMABILITY_INSPECT: HardkasSchemas.ProgrammabilityInspectV1,
  PROGRAMMABILITY_VERIFY: HardkasSchemas.ProgrammabilityVerifyV1,
  PROGRAMMABILITY_CORPUS_REPORT: HardkasSchemas.ProgrammabilityCorpusReportV1,
  PROGRAMMABILITY_APP_PLAN: HardkasSchemas.ProgrammabilityAppPlanV1,
  TOCCATA_PROGRAMMABILITY_CORPUS: HardkasSchemas.ToccataProgrammabilityCorpusV1
} as const;

export type HardkasArtifactSchema = HardkasSchema | string;

export type HardkasArtifactMode = "simulated" | "node" | "rpc" | "l2-rpc" | "real";
