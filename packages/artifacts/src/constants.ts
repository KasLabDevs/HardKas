export const HARDKAS_VERSION = "0.2.1-alpha";

export const ARTIFACT_SCHEMAS = {
  LOCALNET_STATE: "hardkas.localnetState.v1",
  REAL_ACCOUNT_STORE: "hardkas.realAccountStore.v1",
  TX_PLAN: "hardkas.txPlan",
  SIGNED_TX: "hardkas.signedTx",
  TX_RECEIPT: "hardkas.txReceipt",
  TX_TRACE: "hardkas.txTrace",
  SNAPSHOT: "hardkas.snapshot",
  IGRA_TX_PLAN: "hardkas.igraTxPlan.v1",
  IGRA_SIGNED_TX: "hardkas.igraSignedTx.v1",
  IGRA_TX_RECEIPT: "hardkas.igraTxReceipt.v1"
} as const;

export type HardkasArtifactSchema = typeof ARTIFACT_SCHEMAS[keyof typeof ARTIFACT_SCHEMAS] | string;

export type HardkasArtifactMode = "simulated" | "node" | "rpc" | "l2-rpc" | "real";
