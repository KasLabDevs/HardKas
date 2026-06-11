import fs from "node:fs";
import path from "node:path";
import { calculateContentHash } from "@hardkas/artifacts";
import type { Hardkas } from "./index.js";
import { HardkasSchemas } from "@hardkas/artifacts";

export interface VprogsClaims {
  vProgsArtifactInspection: "READY";
  vProgsRuntime: "NOT_CLAIMED";
  vProgsStableApi: "NOT_CLAIMED";
  zkOnchainVerification: "NOT_CLAIMED";
  vmConsensusEquivalence: "NOT_CLAIMED";
  mainnet: "BLOCKED_BY_POLICY";
}

export interface VprogsCapabilitiesResult {
  ok: boolean;
  schema: typeof HardkasSchemas.VProgsCapabilitiesV1;
  status: "VPROGS_INSPECT_SURFACE_READY";
  claims: VprogsClaims;
  errors: string[];
}

export interface VprogsStatusResult {
  ok: boolean;
  schema: typeof HardkasSchemas.VProgsStatusV1;
  status: "VPROGS_INSPECT_SURFACE_READY";
  claims: VprogsClaims;
}

export interface VprogsInspectResult {
  ok: boolean;
  schema: typeof HardkasSchemas.VProgsInspectV1;
  status: "VPROGS_ARTIFACT_INSPECTED" | "VPROGS_ARTIFACT_INVALID";
  path: string;
  artifactHash?: string;
  artifactSchema?: string;
  claims: VprogsClaims;
  issues: Array<{ code: string; message: string; file?: string }>;
}

export class HardkasVprogs {
  constructor(private sdk: Hardkas) {}

  async capabilities(): Promise<VprogsCapabilitiesResult> {
    return createVprogsCapabilities();
  }

  async status(): Promise<VprogsStatusResult> {
    return createVprogsStatus();
  }

  async inspect(targetPath: string): Promise<VprogsInspectResult> {
    return inspectVprogsArtifact(targetPath, this.sdk.cwd);
  }
}

export function isVprogsEnabled(): boolean {
  return true;
}

export function createVprogsCapabilities(): VprogsCapabilitiesResult {
  return {
    ok: true,
    schema: HardkasSchemas.VProgsCapabilitiesV1,
    status: "VPROGS_INSPECT_SURFACE_READY",
    claims: vprogsClaims(),
    errors: [
      "VPROGS_RUNTIME_NOT_CLAIMED",
      "VPROGS_STABLE_API_NOT_CLAIMED",
      "ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED"
    ]
  };
}

export function createVprogsStatus(): VprogsStatusResult {
  return {
    ok: true,
    schema: HardkasSchemas.VProgsStatusV1,
    status: "VPROGS_INSPECT_SURFACE_READY",
    claims: vprogsClaims()
  };
}

export async function inspectVprogsArtifact(
  targetPath: string,
  workspaceRoot = process.cwd()
): Promise<VprogsInspectResult> {
  const resolved = path.resolve(workspaceRoot, targetPath);
  if (!fs.existsSync(resolved)) {
    return {
      ok: false,
      schema: HardkasSchemas.VProgsInspectV1,
      status: "VPROGS_ARTIFACT_INVALID",
      path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
      claims: vprogsClaims(),
      issues: [
        {
          code: "VPROGS_ARTIFACT_MISSING",
          message: `Missing ${resolved}.`,
          file: resolved
        }
      ]
    };
  }

  try {
    const artifact = JSON.parse(fs.readFileSync(resolved, "utf8"));

    // Validate against known vProgs schemas from HardkasSchemas
    const validSchemas = [
      HardkasSchemas.VProgsInspectFixtureV1
    ];

    if (!artifact.schema || !validSchemas.includes(artifact.schema)) {
      return {
        ok: false,
        schema: HardkasSchemas.VProgsInspectV1,
        status: "VPROGS_ARTIFACT_INVALID",
        path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
        claims: vprogsClaims(),
        issues: [
          {
            code: "VPROGS_ARTIFACT_SCHEMA_INVALID",
            message: `Invalid or unknown vProgs schema: ${artifact.schema || "undefined"}`,
            file: resolved
          }
        ]
      };
    }

    return {
      ok: true,
      schema: HardkasSchemas.VProgsInspectV1,
      status: "VPROGS_ARTIFACT_INSPECTED",
      path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
      artifactHash: calculateContentHash(artifact),
      artifactSchema: artifact.schema,
      claims: vprogsClaims(),
      issues: []
    };
  } catch (error: any) {
    return {
      ok: false,
      schema: HardkasSchemas.VProgsInspectV1,
      status: "VPROGS_ARTIFACT_INVALID",
      path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
      claims: vprogsClaims(),
      issues: [
        {
          code: "VPROGS_ARTIFACT_INVALID",
          message: error?.message || "Invalid vProgs artifact JSON.",
          file: resolved
        }
      ]
    };
  }
}

function vprogsClaims(): VprogsClaims {
  return {
    vProgsArtifactInspection: "READY",
    vProgsRuntime: "NOT_CLAIMED",
    vProgsStableApi: "NOT_CLAIMED",
    zkOnchainVerification: "NOT_CLAIMED",
    vmConsensusEquivalence: "NOT_CLAIMED",
    mainnet: "BLOCKED_BY_POLICY"
  };
}
