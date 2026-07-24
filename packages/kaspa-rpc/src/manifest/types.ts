export type RpcCategory = "read" | "mempool" | "events" | "mining" | "admin";
export type RpcSecurityProfile = "public" | "operator" | "privileged";
export type RpcCoverageStatus = 
  | "covered" 
  | "partial" 
  | "gap" 
  | "unsupported-by-node" 
  | "deprecated" 
  | "not-applicable";

export type RpcVerificationLevel = 
  | "unverified"
  | "unit-tested"
  | "certified-simnet"
  | "production-verified";

export interface SnapshotOperation {
  operation: string;
  requestType: string;
  responseType: string;
  category: RpcCategory;
  securityProfile: RpcSecurityProfile;
  requiredNodeFeatures: readonly string[];
}

export interface RpcManifestEntry {
  readonly operation: string;
  readonly requestType: string;
  readonly responseType: string;
  readonly category: RpcCategory;

  readonly source: {
    readonly repository: "kaspanet/rusty-kaspa";
    readonly tag: string;
    readonly commit: string;
    readonly protocol: "wrpc-json" | "wrpc-borsh" | "grpc";
  };

  readonly hardkasMethod?: string;

  readonly requestTyped: boolean;
  readonly responseTyped: boolean;
  readonly errorMapped: boolean;

  readonly requiredNodeFeatures: readonly string[];
  readonly securityProfile: RpcSecurityProfile;

  readonly rawWrapperAvailable: boolean;
  readonly highLevelAbstractionAvailable: boolean;
  readonly cancellationSupported: boolean;

  readonly coverageStatus: RpcCoverageStatus;
  readonly verificationLevel: RpcVerificationLevel;
  readonly notes?: readonly string[];
}
