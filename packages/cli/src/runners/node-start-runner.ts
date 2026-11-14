import {
  DockerKaspadRunner,
  DockerKaspadOptions,
  KaspadNodeStatus
} from "@hardkas/node-runner";
import { PINNED_IMAGE_REFERENCE, NODE_IMAGE_DIGEST_REQUIRED } from "@hardkas/core";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

export interface NodeStartRunnerInput extends DockerKaspadOptions {
  json?: boolean;
}

export interface NodeStartRunnerResult {
  status: KaspadNodeStatus;
  formatted: string;
}

/** An image pinned by its content digest: `<repository>[:tag]@sha256:<64 lowercase hex>` (a tag alone can move). The one rule, from @hardkas/core. */
export const PINNED_NODE_IMAGE = PINNED_IMAGE_REFERENCE;

/**
 * ESCALÓN 4 · P39 · the image `node start` runs, decided before Docker is asked anything: `--image` when given, else
 * `HARDKAS_KASPAD_IMAGE` (the runner's default comes from it), else the pinned reference image. An image given either
 * way must be pinned by digest, or the command is the typed usage error NODE_IMAGE_DIGEST_REQUIRED and nothing is
 * started (`--allow-floating-image` does not lift it).
 */
export function assertNodeStartImagePinned(input: { image?: string | undefined }, env: NodeJS.ProcessEnv = process.env): void {
  const fromOption = input.image !== undefined;
  const image = fromOption ? input.image : env.HARDKAS_KASPAD_IMAGE;
  if (image === undefined) return;
  if (typeof image === "string" && PINNED_NODE_IMAGE.test(image)) return;
  const source = fromOption ? "--image" : "HARDKAS_KASPAD_IMAGE";
  throw new HardkasCliError(
    NODE_IMAGE_DIGEST_REQUIRED,
    `${source} '${String(image)}' is not pinned by digest. 'node start' runs only an image pinned as ` +
      `<repository>[:tag]@sha256:<64 hex digits> (a tag can move to other bytes; --allow-floating-image does not lift this). ` +
      `Nothing was started.`,
    { exitCode: HardkasExitCode.USAGE_ERROR }
  );
}

export async function runNodeStart(
  input: NodeStartRunnerInput
): Promise<NodeStartRunnerResult> {
  assertNodeStartImagePinned(input);
  const runner = new DockerKaspadRunner(input);
  const status = await runner.start();

  const lines = [
    "Kaspa node started successfully",
    "",
    `Backend:   Docker`,
    `Image:     ${status.image}`,
    `Container: ${status.containerName}`,
    `Status:    ✓ running`,
    "",
    "RPC Readiness:",
    `  gRPC:     ${status.transports.grpc.ready ? "✓ ready" : "✗ not ready"} (port ${status.ports.rpc})`,
    `  Borsh:    ${status.transports.borsh.ready ? "✓ ready" : "✗ not ready"} (port ${status.ports.borshRpc})`,
    `  JSON RPC: ${status.transports.json.ready ? "✓ ready" : "✗ not ready"} (port ${status.ports.jsonRpc})`,
    "",
    "Data Directory:",
    `  ${status.dataDir}`
  ];

  return {
    status,
    formatted: lines.join("\n")
  };
}
