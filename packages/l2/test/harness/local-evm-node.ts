import { spawn, spawnSync, execFileSync, type ChildProcess } from "node:child_process";
import net from "node:net";
import type { HardkasExecutionTarget } from "@hardkas/core";

export interface AnvilAccount {
  readonly address: `0x${string}`;
  readonly privateKey: `0x${string}`;
}

export const ANVIL_TEST_ACCOUNTS: readonly AnvilAccount[] = [
  {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  },
  {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  },
  {
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
  },
  {
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
  },
  {
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    privateKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
  }
];

export const ANVIL_CHAIN_ID = 31337;
/**
 * Pinned Docker image digest for Foundry Anvil to guarantee bit-for-bit reproducibility for independent audits.
 * Anvil Version: 1.8.6 (Commit SHA: 6bad0a66de7c83f7b33695044138f0f5fa4c5990).
 */
export const ANVIL_DOCKER_IMAGE_PINNED =
  "ghcr.io/foundry-rs/foundry@sha256:4a16a86f41d30418fbdca47ce2868121bbb0aeaa0a34bde2dd1e2911c4be2464";
export const ANVIL_DOCKER_IMAGE_LATEST = "ghcr.io/foundry-rs/foundry:latest";
export const ANVIL_DOCKER_IMAGE =
  process.env.HARDKAS_ANVIL_IMAGE ?? ANVIL_DOCKER_IMAGE_PINNED;
export const ANVIL_HARNESS_ROLE_LABEL = "hardkas.role";
export const ANVIL_HARNESS_ROLE = "l2-anvil-harness";
/**
 * Per-process run label: cleanup only ever removes containers created by THIS test process,
 * never containers of other sessions or shared infrastructure.
 */
export const ANVIL_HARNESS_RUN_LABEL = "hardkas.run";
export const ANVIL_HARNESS_RUN_ID = `${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export interface LocalEvmNodeHandle {
  readonly rpcUrl: string;
  readonly port: number;
  readonly chainId: number;
  readonly target: HardkasExecutionTarget;
  readonly accounts: readonly AnvilAccount[];
  stop(): Promise<void>;
}

export interface LocalEvmNodeOptions {
  port?: number;
  startupTimeoutMs?: number;
  silent?: boolean;
}

const activeCleanups = new Set<() => void>();

function registerCleanup(fn: () => void): () => void {
  activeCleanups.add(fn);
  return () => {
    activeCleanups.delete(fn);
  };
}

let cleanupHooksRegistered = false;
function ensureProcessCleanupHooks(): void {
  if (cleanupHooksRegistered) return;
  cleanupHooksRegistered = true;

  const runAll = () => {
    for (const cleanup of activeCleanups) {
      try {
        cleanup();
      } catch {
        // Best-effort cleanup on termination
      }
    }
    activeCleanups.clear();
  };

  process.once("exit", runAll);
  process.once("SIGINT", () => {
    runAll();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    runAll();
    process.exit(143);
  });
}

export function sweepDanglingAnvilNodes(): number {
  try {
    const output = execFileSync(
      "docker",
      [
        "ps",
        "-a",
        "--filter",
        `label=${ANVIL_HARNESS_ROLE_LABEL}=${ANVIL_HARNESS_ROLE}`,
        "--filter",
        `label=${ANVIL_HARNESS_RUN_LABEL}=${ANVIL_HARNESS_RUN_ID}`,
        "--format",
        "{{.ID}}"
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();

    if (!output) return 0;
    const ids = output.split(/\r?\n/).filter(Boolean);
    for (const id of ids) {
      try {
        execFileSync("docker", ["rm", "-f", id], { stdio: "ignore" });
      } catch {
        // ignore
      }
    }
    return ids.length;
  } catch {
    return 0;
  }
}

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address() as net.AddressInfo;
      const port = address.port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on("error", reject);
  });
}

/** Native anvil: an explicit, already verified binary (no PATH change needed), else `anvil` on PATH. */
const ANVIL_BIN = process.env.HARDKAS_ANVIL_BIN ?? "anvil";

function checkNativeAnvil(): boolean {
  try {
    const res = spawnSync(ANVIL_BIN, ["--version"], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

function checkDockerAvailable(): boolean {
  try {
    const res = spawnSync("docker", ["version"], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

async function waitForRpcReady(
  url: string,
  timeoutMs: number = 10000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: []
        }),
        signal: AbortSignal.timeout(500)
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        if (json?.result === "0x7a69") {
          return;
        }
      }
    } catch {
      // Node not ready yet, continue polling
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for local EVM node at ${url} after ${timeoutMs}ms`);
}

export async function startLocalEvmNode(
  options: LocalEvmNodeOptions = {}
): Promise<LocalEvmNodeHandle> {
  ensureProcessCleanupHooks();
  const port = options.port ?? (await getFreePort());
  const rpcUrl = `http://127.0.0.1:${port}`;
  const timeoutMs = options.startupTimeoutMs ?? 10000;

  const hasNative = checkNativeAnvil();
  let containerName: string | undefined;
  let childProcess: ChildProcess | undefined;
  let unregisterHook: (() => void) | undefined;

  if (hasNative) {
    const args = ["--port", String(port), "--host", "127.0.0.1"];
    if (options.silent ?? true) {
      args.push("--silent");
    }
    childProcess = spawn(ANVIL_BIN, args, {
      stdio: ["ignore", "ignore", "ignore"],
      detached: false
    });

    const cleanup = () => {
      if (childProcess && !childProcess.killed) {
        try {
          childProcess.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    };
    unregisterHook = registerCleanup(cleanup);
  } else {
    if (!checkDockerAvailable()) {
      throw new Error(
        "Local EVM node cannot be started: neither native 'anvil' nor 'docker' is available in the environment."
      );
    }

    containerName = `hardkas-anvil-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const dockerArgs = [
      "run",
      "-d",
      "--rm",
      "--name",
      containerName,
      "--label",
      `${ANVIL_HARNESS_ROLE_LABEL}=${ANVIL_HARNESS_ROLE}`,
      "--label",
      `${ANVIL_HARNESS_RUN_LABEL}=${ANVIL_HARNESS_RUN_ID}`,
      // Never download implicitly: the pinned image must already be present locally.
      "--pull=never",
      "-p",
      `${port}:8545`,
      "--entrypoint",
      "anvil",
      ANVIL_DOCKER_IMAGE,
      "--host",
      "0.0.0.0",
      "--port",
      "8545"
    ];
    if (options.silent ?? true) {
      dockerArgs.push("--silent");
    }

    execFileSync("docker", dockerArgs, { stdio: "ignore" });

    const cleanup = () => {
      if (containerName) {
        try {
          execFileSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
        } catch {
          // ignore
        }
      }
    };
    unregisterHook = registerCleanup(cleanup);
  }

  try {
    await waitForRpcReady(rpcUrl, timeoutMs);
  } catch (err) {
    if (unregisterHook) unregisterHook();
    if (childProcess && !childProcess.killed) {
      try {
        childProcess.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
    if (containerName) {
      try {
        execFileSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
      } catch {
        // ignore
      }
    }
    throw err;
  }

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (unregisterHook) unregisterHook();

    if (childProcess && !childProcess.killed) {
      try {
        childProcess.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
    if (containerName) {
      try {
        execFileSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
      } catch {
        // ignore
      }
    }
  };

  const target: HardkasExecutionTarget = {
    mode: "localnet",
    domain: "evm-l2",
    network: "anvil-31337"
  };

  return {
    rpcUrl,
    port,
    chainId: ANVIL_CHAIN_ID,
    target,
    accounts: ANVIL_TEST_ACCOUNTS,
    stop
  };
}
