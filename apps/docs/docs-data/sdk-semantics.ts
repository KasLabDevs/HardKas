export interface SdkSymbolMetadata {
  package: string;
  symbol: string;
  purpose: string;
  maturity: "stable" | "rc" | "experimental" | "legacy" | "internal";
  securityBoundary?: string;
  sideEffects?: string[];
  artifactsProduced?: string[];
  environments?: ("simulated" | "real-node" | "universal")[];
}

export const SDK_SEMANTICS: Record<string, SdkSymbolMetadata> = {
  "Hardkas.open": {
    package: "@hardkas/sdk",
    symbol: "Hardkas.open",
    purpose: "Primary entrypoint to initialize the SDK within a workspace context.",
    maturity: "stable",
    environments: ["universal"],
    securityBoundary: "Reads workspace configuration and local state."
  },
  "HardkasTx.plan": {
    package: "@hardkas/sdk",
    symbol: "HardkasTx.plan",
    purpose: "Discovers UTXOs and computes a valid transaction plan.",
    maturity: "stable",
    environments: ["universal"],
    artifactsProduced: ["hardkas.txPlan.v1"]
  },
  "HardkasTx.sign": {
    package: "@hardkas/sdk",
    symbol: "HardkasTx.sign",
    purpose: "Authorizes a transaction plan with required signatures.",
    maturity: "stable",
    environments: ["universal"],
    securityBoundary: "Requires access to private key material via authorizers.",
    artifactsProduced: ["hardkas.signedTx.v1"]
  },
  "HardkasTx.send": {
    package: "@hardkas/sdk",
    symbol: "HardkasTx.send",
    purpose: "Submits a signed transaction to the active network.",
    maturity: "stable",
    environments: ["universal"],
    sideEffects: ["Network broadcast (real-node) or local simulation mutation (simulated)."],
    artifactsProduced: ["hardkas.txReceipt.v1"]
  },
  "HardkasArtifactsManager.verify": {
    package: "@hardkas/sdk",
    symbol: "HardkasArtifactsManager.verify",
    purpose: "Cryptographically verifies artifact determinism and lineage.",
    maturity: "rc", // cache-dependent bug with contentHash
    environments: ["universal"],
    securityBoundary: "Fails silently (returns cold miss) when contentHash is not cached."
  },
  "HardkasCovenants": {
    package: "@hardkas/sdk",
    symbol: "HardkasCovenants",
    purpose: "Covenant evaluation and inspection.",
    maturity: "experimental"
  },
  "HardkasL2": {
    package: "@hardkas/sdk",
    symbol: "HardkasL2",
    purpose: "L2 sequencing and bridging features.",
    maturity: "experimental"
  },
  "pskt": {
    package: "@hardkas/sdk",
    symbol: "pskt",
    purpose: "Partially Signed Kaspa Transactions module.",
    maturity: "experimental"
  }
};
