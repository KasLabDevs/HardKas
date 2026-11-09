import { HARDKAS_EXTENSION_API_VERSION, type HardkasExtension } from "@hardkas/cli/extension-kit";
import { registerL2Commands, registerL2Aliases } from "./commands/l2.js";
import { registerLocalCommands } from "./commands/local.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { foundryReferenceFor, isMusl } from "./toolchains/foundry.js";
import { solcReferenceFor } from "./toolchains/solc.js";

const foundryHere = () => foundryReferenceFor(process.platform, process.arch, isMusl());
const solcHere = () => solcReferenceFor(process.platform, process.arch, isMusl());
// the package root: dist/extension.js (installed) or src/extension.ts (sources) are one level below it
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * `@hardkas/ext-l2`: the Igra L2 (EVM) lab as a HardKAS CLI extension (L2-EXT, design §4).
 *
 * The CLI imports this entry only after its registry checked the package (catalog name, the CLI's exact version,
 * manifest, real path inside the project's node_modules). Loading it imports nothing of @hardkas/l2 or viem: every
 * command loads its runner when it runs.
 */
/** Whether a pinned toolchain is installed and matches its pin (it never installs it). */
async function toolchainCheck(id: string, ref: ReturnType<typeof foundryHere>): Promise<{ ok: boolean; detail: string; fix?: string }> {
  if (!ref) return { ok: false, detail: `no pinned ${id} release for ${process.platform}-${process.arch}${isMusl() ? " (musl libc)" : ""}` };
  const { verifyManagedToolchain } = await import("@hardkas/core");
  const v = await verifyManagedToolchain(ref);
  if (v.ok) return { ok: true, detail: `${id} ${ref.version} installed and verified at ${v.dir}` };
  return v.installed
    ? { ok: false, detail: `${id} at ${v.dir} does not match its pin: ${v.problems.join("; ")}`, fix: `hardkas toolchain install ${id} --force` }
    : { ok: false, detail: `${id} ${ref.version} is not installed`, fix: `hardkas toolchain install ${id}` };
}

const extension: HardkasExtension = {
  apiVersion: HARDKAS_EXTENSION_API_VERSION,
  id: "l2",
  registerCommands(program) {
    registerL2Commands(program);
    registerLocalCommands(program);
    registerL2Aliases(program);
  },
  // L2-EXT stage 5: a minimal Solidity project, offline (no forge-std, no git dependency)
  templates: () => [
    {
      id: "l2-evm",
      description: "Minimal Solidity project compiled offline by the pinned forge + solc",
      dir: path.join(PACKAGE_ROOT, "templates", "l2-evm"),
      nextSteps: ["npx hardkas toolchain install foundry", "npx hardkas toolchain install solc", "npx hardkas l2 compile"]
    }
  ],
  // L2-EXT stages 3 and 5: Foundry and solc, pinned, for this platform; the core's toolchain manager installs them on
  // request only
  toolchains: () => [foundryHere(), solcHere()].filter((r): r is NonNullable<typeof r> => r !== undefined),
  doctorChecks: () => [
    {
      id: "l2.foundry",
      run: () => toolchainCheck("foundry", foundryHere())
    },
    {
      id: "l2.solc",
      run: () => toolchainCheck("solc", solcHere())
    },
    {
      id: "l2.sdk",
      async run() {
        try {
          const l2 = await import("@hardkas/l2");
          const profiles = l2.listL2Profiles();
          return { ok: profiles.length > 0, detail: `@hardkas/l2 loads; ${profiles.length} built-in profiles (${profiles.map((p) => p.name).join(", ")})` };
        } catch (e) {
          return { ok: false, detail: `@hardkas/l2 does not load: ${(e as Error)?.message ?? String(e)}`, fix: "Reinstall the extension at the CLI's version (@hardkas/ext-l2 and @hardkas/l2 are not published in this release: from a local build or tarballs)" };
        }
      }
    },
    {
      // L2-EXT stage 4: the local node, as the process manager and the port see it (Foundry itself is l2.foundry)
      id: "l2.node",
      async run(ctx) {
        const { anvilStateDir, loopbackChainId, ANVIL_CHAIN_ID, DEFAULT_ANVIL_PORT } = await import("./node/anvil.js");
        const { getManagedProcessStatus, isLoopbackPortFree } = await import("@hardkas/node-orchestrator");
        const st = await getManagedProcessStatus({ stateDir: anvilStateDir(ctx.workspaceRoot) });
        const port = st.record?.port ?? DEFAULT_ANVIL_PORT;
        if (st.state === "running") {
          const chainId = await loopbackChainId(port);
          if (chainId === ANVIL_CHAIN_ID) return { ok: true, detail: `running (PID ${st.record!.pid}) on http://127.0.0.1:${port}, chain id ${chainId}` };
          return chainId === undefined
            ? { ok: false, detail: `running (PID ${st.record!.pid}) but not answering eth_chainId on 127.0.0.1:${port}`, fix: "hardkas l2 node logs; then hardkas l2 node stop && hardkas l2 node start" }
            : { ok: false, detail: `running (PID ${st.record!.pid}) but 127.0.0.1:${port} answers chain id ${chainId}, expected ${ANVIL_CHAIN_ID}` };
        }
        if (st.state === "stale_record") return { ok: false, detail: `stopped: ${st.detail} (a leftover record)`, fix: "hardkas l2 node start" };
        if (st.state === "foreign_process") return { ok: false, detail: `stopped: ${st.detail}; it is not touched`, fix: "hardkas l2 node start" };
        if (st.state === "unverifiable") return { ok: false, detail: st.detail };
        // not started by HardKAS: is the port free, taken by something else, or another EVM node?
        if (await isLoopbackPortFree(port)) return { ok: false, detail: `not running (127.0.0.1:${port} is free)`, fix: "hardkas l2 node start" };
        const chainId = await loopbackChainId(port);
        if (chainId === undefined) return { ok: false, detail: `not running; 127.0.0.1:${port} is in use by another process that does not answer JSON-RPC`, fix: "free the port, or hardkas l2 node start --port <other>" };
        if (chainId !== ANVIL_CHAIN_ID) return { ok: false, detail: `not running; 127.0.0.1:${port} is in use by an EVM node HardKAS did not start, with chain id ${chainId} (expected ${ANVIL_CHAIN_ID})` };
        return { ok: false, detail: `not running; 127.0.0.1:${port} is in use by an EVM node HardKAS did not start (chain id ${chainId}): HardKAS does not manage or stop it` };
      }
    }
  ]
};

export default extension;
