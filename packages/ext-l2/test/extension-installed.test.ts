import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "@hardkas/sdk";
import { installL2Extension, removeProject, cliIn, extManifest } from "./helpers/installed-l2.js";

// L2-EXT stage 2 · the built CLI with @hardkas/ext-l2 installed in the project (a real node_modules directory), through
// the real registry: P2 (one CLI: the l2 commands and the moved ones work), lazy loading (an L1 command loads the
// extension's entry but no @hardkas/l2 / viem), and the C2 refusals (another version, disabled) on real files.

let parent: string;
let ws: string;
let links: string[] = [];

const docs = (s: string) =>
  s
    .split(/\r?\n(?=\{)/)
    .map((chunk) => {
      try {
        return JSON.parse(chunk);
      } catch {
        return undefined;
      }
    })
    .filter((d) => d !== undefined);

beforeAll(async () => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ext-l2-installed-"));
  ws = path.join(parent, "project");
  fs.mkdirSync(ws);
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};\n");
  await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  links = installL2Extension(ws);
}, 300_000);

afterAll(() => {
  if (parent) {
    removeProject(ws, links);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

describe("L2-EXT · the CLI with the l2 extension installed in the project", () => {
  it("`extension list` reports it loaded at the CLI's version", { timeout: 180_000 }, () => {
    const r = cliIn(ws, ["extension", "list", "--json"], "list");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.json.result.extensions).toEqual([{ id: "l2", package: "@hardkas/ext-l2", status: "loaded", version: extManifest().version }]);
  });

  it("an L1 command loads the extension's entry but no @hardkas/l2 and no viem (runners load lazily)", { timeout: 180_000 }, () => {
    const r = cliIn(ws, ["capabilities", "--json"], "l1");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect({ sawCli: r.sawCli, loadedExtension: r.loadedExtension, loadedL2Code: r.loadedL2Code }).toEqual({
      sawCli: true,
      loadedExtension: true,
      loadedL2Code: false
    });
  });

  it("`l2 networks` runs from the extension (and only then loads @hardkas/l2)", { timeout: 180_000 }, () => {
    const r = cliIn(ws, ["l2", "networks", "--json"], "networks");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(JSON.stringify(r.json)).toContain("igra-galleon");
    expect(r.loadedL2Code).toBe(true);
  });

  it("`l2 tx build` on mainnet without --allow-mainnet is still refused before any RPC (the stage-1 guards travel with it)", { timeout: 180_000 }, () => {
    const r = cliIn(ws, ["l2", "tx", "build", "--network", "igra-mainnet", "--url", "http://127.0.0.1:1", "--to", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "--json"], "mainnet");
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/L2_MAINNET_WRITE_BLOCKED|L2_FEE_POLICY_REQUIRED/);
  });

  it("`dev doctor --json` (the alias of `l2 doctor`) prints valid JSON without ANSI escapes", { timeout: 180_000 }, () => {
    // moved from packages/cli/test/cli-semantics.test.ts ("JSON stdout is strictly valid and without ANSI escapes")
    const r = cliIn(ws, ["dev", "doctor", "--json", "--rpc-url", "http://127.0.0.1:1"], "dev-doctor");
    expect(r.stdout).not.toContain("\x1b[");
    expect(docs(r.stdout).find((d: any) => d?.schema === "hardkas.devDoctor.v1"), r.stdout + r.stderr).toBeTruthy();
  });

  it("`dev doctor` does not report artifacts the CLI wrote, and `hardkas verify` accepts, as malformed", { timeout: 300_000 }, () => {
    // moved from packages/cli/test/surface-truth-1.test.ts (ST-E) with `dev doctor`; same workspace recipe
    for (const args of [
      ["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "7", "--network", "simulated", "--out", "a-plan.json", "--json"],
      ["tx", "sign", "a-plan.json", "--out", "a-signed.json", "--json"],
      ["tx", "send", "a-signed.json", "--network", "simulated", "--json"]
    ]) {
      const r = cliIn(ws, args, `st-${args[1]}`);
      expect(r.status, r.stdout + r.stderr).toBe(0);
    }
    const v = cliIn(ws, ["verify", "--json"], "verify");
    expect(v.status, (v.stdout + v.stderr).slice(0, 600)).toBe(0);
    const d = cliIn(ws, ["dev", "doctor", "--json", "--rpc-url", "http://127.0.0.1:1"], "st-dev-doctor");
    const report = docs(d.stdout).find((doc: any) => doc?.schema === "hardkas.devDoctor.v1");
    expect(report, (d.stdout + d.stderr).slice(0, 400)).toBeTruthy();
    const flagged = (report?.checks ?? [])
      .filter((c: any) => c.status === "error" && (c.details?.paths ?? []).length > 0)
      .map((c: any) => `${c.code}: ${path.basename(c.details.paths[0])}`);
    expect(flagged, flagged.join(", ")).toEqual([]);
  });

  // NEW-11: the doctor split by responsibility, and the alias's report unchanged
  const L2_CHECKS = ["Igra/L2 Features", "L2 Profile", "Igra RPC Connectivity", "Chain ID Verification", "Local EVM Account"];
  const shape = (c: any) => `${c.name}|${c.status}|${c.code ?? ""}`;

  it("`dev doctor` = `hardkas doctor workspace` (core) + the L2 section, check for check", { timeout: 300_000 }, () => {
    const dev = docs(cliIn(ws, ["dev", "doctor", "--json", "--rpc-url", "http://127.0.0.1:1"], "eq-dev").stdout).find((d: any) => d?.schema === "hardkas.devDoctor.v1");
    const core = docs(cliIn(ws, ["doctor", "workspace", "--json"], "eq-core").stdout).find((d: any) => d?.schema === "hardkas.devDoctor.v1");
    expect(dev && core).toBeTruthy();
    expect(dev.checks.filter((c: any) => !L2_CHECKS.includes(c.name)).map(shape)).toEqual(core.checks.map(shape));
    expect(dev.checks.filter((c: any) => L2_CHECKS.includes(c.name)).map((c: any) => c.name)).toEqual(
      expect.arrayContaining(["Igra/L2 Features", "Igra RPC Connectivity", "Local EVM Account"])
    );
  });

  it("`l2 doctor` checks the L2 side only (its own report schema)", { timeout: 180_000 }, () => {
    const r = cliIn(ws, ["l2", "doctor", "--json", "--rpc-url", "http://127.0.0.1:1"], "l2-doctor");
    const report = docs(r.stdout).find((d: any) => d?.schema === "hardkas.l2Doctor.v1");
    expect(report, r.stdout + r.stderr).toBeTruthy();
    expect(report.checks.every((c: any) => L2_CHECKS.includes(c.name))).toBe(true);
    expect(report.checks.find((c: any) => c.name === "Igra RPC Connectivity")?.status).toBe("warning");
  });

  it("`doctor l2` runs the extension's checks (the SDK check passes; no local Anvil is expected here)", { timeout: 180_000 }, () => {
    const r = cliIn(ws, ["doctor", "l2", "--json"], "doctor-l2");
    expect(r.json?.schema, r.stdout + r.stderr).toBe("hardkas.extensionDoctor.v1");
    const checks = r.json.extensions[0].checks;
    expect(checks.find((c: any) => c.id === "l2.sdk")?.ok).toBe(true);
    // stage 3 added l2.foundry: here Foundry is not installed, so it says so and names the exact command;
    // stage 4 replaced l2.local-rpc with l2.node (the managed node and its port)
    // stage 5 added l2.solc (the pinned compiler; not installed here either)
    expect(checks.map((c: any) => c.id)).toEqual(["l2.foundry", "l2.solc", "l2.sdk", "l2.node"]);
    expect(checks.find((c: any) => c.id === "l2.solc")).toMatchObject({ ok: false });
    const foundry = checks.find((c: any) => c.id === "l2.foundry");
    if (foundry.detail.startsWith("no pinned Foundry")) expect(foundry.ok).toBe(false);
    else expect(foundry).toMatchObject({ ok: false, fix: "hardkas toolchain install foundry" });
  });

  // L2-EXT stage 4 · the node commands without Foundry, and what doctor l2 tells apart (the real Anvil runs are in
  // anvil-node.foundry.test.ts)
  it("`l2 node start` without Foundry: TOOLCHAIN_NOT_INSTALLED with the exact command; nothing started; status not_running", { timeout: 180_000 }, () => {
    const r = cliIn(ws, ["l2", "node", "start", "--port", "18545", "--json"], "node-start-nofoundry");
    const env = docs(r.stdout).find((d: any) => d?.ok === false);
    expect({ status: r.status, code: env?.code }, r.stdout + r.stderr).toMatchObject({ status: 1, code: "TOOLCHAIN_NOT_INSTALLED" });
    expect(r.stdout + r.stderr).toContain("hardkas toolchain install foundry");
    expect(fs.existsSync(path.join(ws, ".hardkas", "processes", "l2-anvil", "process.json"))).toBe(false);
    const s = cliIn(ws, ["l2", "node", "status", "--json"], "node-status-nofoundry");
    expect(s.json?.result?.state).toBe("not_running");
  });

  it("doctor l2 · l2.node tells apart: port free, port taken by a non-JSON-RPC process, an EVM node with another chain id", { timeout: 300_000 }, async () => {
    const { spawn } = await import("node:child_process");
    const nodeCheck = () => cliIn(ws, ["doctor", "l2", "--json"], "doctor-node").json?.extensions?.[0]?.checks?.find((c: any) => c.id === "l2.node");
    // the fake listeners run in their own processes: cliIn blocks this one while the CLI runs
    const serve = async (code: string) => {
      const child = spawn(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
      await new Promise<void>((resolve, reject) => {
        child.stdout!.on("data", (d) => String(d).includes("up") && resolve());
        child.once("exit", () => reject(new Error("fake listener exited (is 127.0.0.1:8545 in use?)")));
      });
      return child;
    };

    const free = nodeCheck();
    expect(free?.detail ?? "").toMatch(/not running \(127\.0\.0\.1:8545 is free\)|in use/);

    const raw = await serve(`require("net").createServer((s) => s.destroy()).listen(8545, "127.0.0.1", () => console.log("up"));`);
    try {
      expect(nodeCheck()).toMatchObject({ ok: false, detail: expect.stringContaining("does not answer JSON-RPC") });
    } finally {
      raw.kill();
      await new Promise((r) => raw.once("exit", r));
    }

    const other = await serve(
      `require("http").createServer((q, r) => { r.setHeader("content-type", "application/json"); r.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" })); }).listen(8545, "127.0.0.1", () => console.log("up"));`
    );
    try {
      expect(nodeCheck()).toMatchObject({ ok: false, detail: expect.stringContaining("with chain id 1 (expected 31337)") });
    } finally {
      other.kill();
      await new Promise((r) => other.once("exit", r));
    }
  });

  // The node HardKAS started (its record and OS identity match) but the service is wrong: identity is not service.
  // The "node" is a managed process started through the core's manager into this workspace's Anvil state dir.
  it.each([
    ["answers another chain id", "0x1", /^running \(PID \d+\) but 127\.0\.0\.1:\d+ answers chain id 1, expected 31337$/],
    ["does not answer eth_chainId", "silent", /^running \(PID \d+\) but not answering eth_chainId on 127\.0\.0\.1:\d+$/]
  ])("doctor l2 · l2.node · our own node (identity verified) that %s: not ok, says so", { timeout: 300_000 }, async (_name, mode, detail) => {
    const net = await import("node:net");
    const { startManagedProcess, stopManagedProcess, getManagedProcessStatus } = await import("@hardkas/node-orchestrator");
    const { anvilStateDir, ANVIL_PROCESS_ID } = await import("../src/node/anvil.js");
    const port = await new Promise<number>((resolve) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const p = (s.address() as import("node:net").AddressInfo).port;
        s.close(() => resolve(p));
      });
    });
    const script = path.join(parent, "fake-evm-node.cjs");
    fs.writeFileSync(
      script,
      `const [port, mode] = process.argv.slice(2);
require("http").createServer((q, r) => {
  if (mode === "silent") return; // accepts the connection, never answers
  r.setHeader("content-type", "application/json"); r.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: mode }));
}).listen(Number(port), "127.0.0.1", () => console.log("listening " + port));
setInterval(() => {}, 1 << 30);`
    );
    const listening = () =>
      new Promise<boolean>((resolve) => {
        const c = net.connect(port, "127.0.0.1", () => { c.destroy(); resolve(true); });
        c.once("error", () => resolve(false));
      });
    const spec = {
      id: ANVIL_PROCESS_ID,
      binaryPath: process.execPath,
      args: [script, String(port), mode],
      stateDir: anvilStateDir(ws),
      verifyBinary: () => ({ ok: true, sha256: "0".repeat(64), problems: [] }),
      port,
      readiness: listening,
      readinessTimeoutMs: 15_000
    };
    const { record } = await startManagedProcess(spec);
    try {
      expect((await getManagedProcessStatus(spec)).state).toBe("running");
      const check = cliIn(ws, ["doctor", "l2", "--json"], `doctor-own-${mode}`).json?.extensions?.[0]?.checks?.find((c: any) => c.id === "l2.node");
      expect(check, JSON.stringify(check)).toMatchObject({ ok: false, detail: expect.stringMatching(detail) });
      expect(check.detail).toContain(`PID ${record.pid}`);
    } finally {
      expect(await stopManagedProcess(spec)).toMatchObject({ result: "stopped", pid: record.pid });
    }
  });

  // L2-EXT stage 5 (it replaces the stage-2 placeholder: "this version does not provide it yet")
  it("`create l2-evm`: a minimal offline Solidity project (no forge-std, no git dependency, compiler never auto-fetched)", { timeout: 180_000 }, () => {
    const r = cliIn(ws, ["create", "l2-evm", "my-l2", "--json"], "create");
    expect(r.json?.ok, r.stdout + r.stderr).toBe(true);
    expect(r.json.result.nextSteps).toEqual(["cd my-l2", "npm install", "npx hardkas toolchain install foundry", "npx hardkas toolchain install solc", "npx hardkas l2 compile"]);
    const dir = path.join(ws, "my-l2");
    const files: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.relative(dir, path.join(d, e.name)).split(path.sep).join("/"))));
    walk(dir);
    expect(files.sort()).toEqual([".gitignore", "README.md", "foundry.toml", "hardkas.config.ts", "package.json", "src/Counter.sol", "test/Counter.t.sol"]);
    const toml = fs.readFileSync(path.join(dir, "foundry.toml"), "utf8");
    expect(toml).toMatch(/^offline = true$/m);
    expect(toml).toMatch(/^auto_detect_solc = false$/m);
    expect(toml).toMatch(/^solc_version = "0\.8\.38"$/m);
    expect(toml).toMatch(/^evm_version = "cancun"$/m);
    expect(toml).toMatch(/^libs = \[\]$/m);
    expect(toml).toMatch(/PROVISIONAL.*NOT a statement that Igra runs this EVM version/s);
    for (const f of ["src/Counter.sol", "test/Counter.t.sol"]) {
      const sol = fs.readFileSync(path.join(dir, f), "utf8");
      expect(sol).toMatch(/^pragma solidity 0\.8\.38;$/m);
      // only relative imports (nothing to fetch, no remappings)
      const imports = sol.split(/\r?\n/).filter((l) => /^\s*import\b/.test(l));
      for (const l of imports) expect(l).toMatch(/from\s+"\.\.?\//);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    expect(pkg.devDependencies).toEqual({ "@hardkas/cli": extManifest().version, "@hardkas/ext-l2": extManifest().version });
  });

  it("`l2 compile` without Foundry: TOOLCHAIN_NOT_INSTALLED with the exact command; nothing compiled, nothing written", { timeout: 180_000 }, () => {
    const dir = path.join(ws, "my-l2");
    // the created project declares the extension; a user's `npm install` would put it in its node_modules
    const projectLinks = installL2Extension(dir);
    try {
      const r = cliIn(dir, ["l2", "compile", "--json"], "compile-nofoundry");
      const env = docs(r.stdout).find((d: any) => d?.ok === false);
      expect({ status: r.status, code: env?.code }, r.stdout + r.stderr).toMatchObject({ status: 1, code: "TOOLCHAIN_NOT_INSTALLED" });
      expect(r.stdout + r.stderr).toContain("hardkas toolchain install foundry");
      for (const d of ["out", "cache", path.join(".hardkas", "l2-build.json")]) expect(fs.existsSync(path.join(dir, d))).toBe(false);
    } finally {
      for (const l of projectLinks) fs.unlinkSync(l);
    }
  });

  it("`l2 compile` where there is no Foundry project: L2_PROJECT_NOT_FOUND, naming the template", { timeout: 180_000 }, () => {
    const r = cliIn(ws, ["l2", "compile", "--json"], "compile-noproject");
    const env = docs(r.stdout).find((d: any) => d?.ok === false);
    expect({ status: r.status, code: env?.code }, r.stdout + r.stderr).toMatchObject({ code: "L2_PROJECT_NOT_FOUND" });
    expect(r.status).not.toBe(0);
    expect(env.message).toContain("hardkas create l2-evm");
  });

  it("`toolchain install solc --from-file` a file that is not the pinned solc: TOOLCHAIN_ASSET_DIGEST_MISMATCH, nothing installed", { timeout: 180_000 }, () => {
    const fake = path.join(parent, process.platform === "win32" ? "solc-windows-amd64-v0.8.38+commit.1835d247.exe" : "solc-linux-amd64-v0.8.38+commit.1835d247");
    fs.writeFileSync(fake, "not the compiler");
    const home = path.join(parent, "solc-home");
    fs.mkdirSync(home, { recursive: true });
    const r = cliIn(ws, ["toolchain", "install", "solc", "--from-file", fake, "--json"], "solc-tampered", { HARDKAS_HOME: home });
    const env = docs(r.stdout).find((d: any) => d?.ok === false) ?? r.json;
    expect({ status: r.status, code: env?.code }, r.stdout + r.stderr).toMatchObject({ code: "TOOLCHAIN_ASSET_DIGEST_MISMATCH" });
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(path.join(home, "toolchains", "solc"))).toBe(false);
  });

  it("`toolchain status` lists solc 0.8.38 as pinned and not installed (installing the extension installed nothing)", { timeout: 180_000 }, () => {
    const r = cliIn(ws, ["toolchain", "status", "--json"], "status-solc");
    const solc = r.json?.toolchains?.find((t: any) => t.id === "solc");
    expect(solc, r.stdout + r.stderr).toMatchObject({ installed: false, verified: false, version: "0.8.38" });
  });

  it("another installed version: EXTENSION_INCOMPATIBLE, and the extension's code is not loaded", { timeout: 180_000 }, () => {
    const pkgFile = path.join(ws, "node_modules", "@hardkas", "ext-l2", "package.json");
    const original = fs.readFileSync(pkgFile, "utf8");
    try {
      fs.writeFileSync(pkgFile, JSON.stringify({ ...JSON.parse(original), version: "0.0.1-other" }, null, 2));
      const r = cliIn(ws, ["l2", "networks", "--json"], "incompatible");
      expect({ status: r.status, code: r.json?.code, reason: r.json?.context?.reason }).toMatchObject({ status: 1, code: "EXTENSION_INCOMPATIBLE" });
      expect(r.json?.message).toContain("0.0.1-other");
      expect({ loadedExtension: r.loadedExtension, loadedL2Code: r.loadedL2Code, sawCli: r.sawCli }).toEqual({ loadedExtension: false, loadedL2Code: false, sawCli: true });
    } finally {
      fs.writeFileSync(pkgFile, original);
    }
  });

  it("disabled in hardkas.config: EXTENSION_DISABLED, and the extension's code is not loaded", { timeout: 180_000 }, () => {
    const cfg = path.join(ws, "hardkas.config.ts");
    const original = fs.readFileSync(cfg, "utf8");
    try {
      fs.writeFileSync(cfg, "export default { extensions: { l2: false } };\n");
      const r = cliIn(ws, ["l2", "networks", "--json"], "disabled");
      expect({ status: r.status, code: r.json?.code }).toEqual({ status: 1, code: "EXTENSION_DISABLED" });
      expect({ loadedExtension: r.loadedExtension, loadedL2Code: r.loadedL2Code, sawCli: r.sawCli }).toEqual({ loadedExtension: false, loadedL2Code: false, sawCli: true });
    } finally {
      fs.writeFileSync(cfg, original);
    }
  });
});
