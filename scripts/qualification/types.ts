export type QualificationStatus =
  | "PASS"
  | "FAIL"
  | "SKIPPED"
  | "UNIMPLEMENTED"
  | "ENVIRONMENT_NOT_QUALIFIED"
  | "BLOCKED_BY_PREVIOUS_FAILURE";

export interface AssertionResult {
  name: string;
  passed: boolean;
  expected?: any;
  actual?: any;
  error?: any;
}

export interface GateResult {
  id: string;
  name: string;
  status: QualificationStatus;
  startedAt: string;
  endedAt: string;
  assertions: AssertionResult[];
  evidence: string[];
  error?: string;
  implemented: boolean;
  mandatory: boolean;
}

export interface RunManifest {
  runId: string;
  startTime: string;
  endTime?: string;
  os: string;
  osVersion: string;
  arch: string;
  nodeVersion: string;
  npmVersion: string;
  pnpmVersion?: string;
  dockerVersion?: string;
  kaspadImage?: string;
  kaspadImageId?: string;
  containerId?: string;
  networkArgs?: string;
  packageSource: string;
  registry?: string;
  hardkasVersion: string;
  consumerPath: string;
  logPath: string;
  artifactPath: string;
  reportPath: string;
  cliVersion?: string;
  sdkVersion?: string;
  coreVersion?: string;
  rpcVersion?: string;
  results: Record<string, GateResult>;
  decision: "PASS" | "PARTIAL" | "FAIL" | "PENDING";
}

export type Capability =
  | "publicNpmConsumer"
  | "dockerAvailable"
  | "kaspadStarted"
  | "localnetManaged"
  | "minerStarted"
  | "rpcReportedReady"
  | "rpcActuallyReachable"
  | "rpcReady"
  | "fundedAccount"
  | "matureUtxo";

export interface QualificationOptions {
  version: string;
  gates: string[];
  fresh: boolean;
  keepOnFailure: boolean;
  consumerRoot: string;
  reportDir: string;
  registry?: string;
}

export interface ExecutionContext {
  options: QualificationOptions;
  manifest: RunManifest;
  consumerDir: string;
  repoRoot: string;
  dockerContainerId?: string;
  capabilities: Set<Capability>;
}

export interface GateDefinition {
  id: string;
  name: string;
  mandatory: boolean;
  implemented: boolean;
  requires: Capability[];
  provides?: Capability[];
  run: (ctx: ExecutionContext) => Promise<Omit<GateResult, "id" | "name" | "mandatory" | "implemented" | "startedAt" | "endedAt">>;
}
