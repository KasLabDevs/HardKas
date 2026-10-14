import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";
import { loadHardkasConfig, resolveNewIntentTarget } from "@hardkas/config";

vi.setConfig({ testTimeout: 90_000 });

// WORKSPACE-AUTHORITY-2 · BEFORE (investigation, 2026-10-10, HEAD 3b0651e7f) — SDK-EXECUTION-IGNORED (F5).
// A workspace declares WHERE it executes through the `execution` contract of hardkas.config.ts (a default target and
// named targets, or one target). The CLI resolves that contract (`resolveNewIntentTarget`, `tx plan/sign/send`,
// `--target`). The SDK never reads it: `Hardkas.open` takes its active network from the deprecated `defaultNetwork`
// (`sdk/src/index.ts:280`), and the config loader injects the built-in mirror `defaultNetwork: "simulated"` into every
// user config that declares `execution` without the legacy key (`config/src/load.ts:78`). So the same project runs in
// two execution worlds at once: the simulator for the SDK, the declared target for the CLI — silently, no error, no
// warning. The SDK's only option, `network`, is a network NAME: it is honoured, but a target name given there is not
// refused, it becomes a network that does not exist. Red on the base by design; the controls are green.

const SCAFFOLD_TARGETS =
  'targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" }, localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } }';
const CONFIGS = {
  /** what `hardkas init` scaffolds today (both targets, simulator by default) */
  scaffold: `export default { execution: { default: "simulator", ${SCAFFOLD_TARGETS} }, network: { allowPublic: false } };\n`,
  /** the same project after the developer switched its default to the localnet node */
  localnetDefault: `export default { execution: { default: "localnet", ${SCAFFOLD_TARGETS} }, network: { allowPublic: false } };\n`,
  /** the single-target form of the contract, a node on devnet */
  rpcDevnet: `export default { execution: { mode: "rpc", domain: "kaspa-l1", network: "devnet" } };\n`,
  /** the legacy key alone (the resolver infers localnet/simnet from the name and warns) */
  legacySimnet: `export default { defaultNetwork: "simnet" };\n`
};

/** A workspace with that config and an initialised `.hardkas/` (a non-simulated open requires one). */
function workspace(body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wa2-"));
  fs.writeFileSync(path.join(dir, "hardkas.config.ts"), body);
  fs.mkdirSync(path.join(dir, ".hardkas"));
  return dir;
}
const remove = (dir: string) => fs.rmSync(dir, { recursive: true, force: true });
const providerOf = (sdk: Hardkas) => sdk.rpc.constructor.name;
/** What the CLI's resolver says the workspace executes on (the authority the CLI follows). */
const authorityOf = async (dir: string) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const loaded = await loadHardkasConfig({ cwd: dir, workspaceRoot: dir });
    return { loaded, target: resolveNewIntentTarget({ config: loaded.config }) };
  } finally {
    warn.mockRestore();
  }
};
const outcomeOf = <T>(p: Promise<T>, pick: (v: T) => Record<string, unknown>) =>
  p.then(
    (v) => ({ kind: "ok" as const, ...pick(v) }),
    (e: any) => ({ kind: "refused" as const, code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 220) })
  );

describe("WORKSPACE-AUTHORITY-2 · BEFORE · the workspace declares its execution target, the SDK runs another", () => {
  it("WA2-A1 · execution.default = localnet: the CLI's resolver says localnet/simnet; the SDK must open on the same target, not on the simulator", async () => {
    const dir = workspace(CONFIGS.localnetDefault);
    try {
      const { target } = await authorityOf(dir);
      expect(target, "control: the resolver the CLI follows").toEqual({ mode: "localnet", domain: "kaspa-l1", network: "simnet" });
      const sdk = await Hardkas.open({ cwd: dir });
      try {
        expect({ network: sdk.network, provider: providerOf(sdk) }).toEqual({ network: "simnet", provider: expect.not.stringContaining("Simulated") });
      } finally {
        await sdk.close();
      }
    } finally {
      remove(dir);
    }
  });

  it("WA2-A2 · the single-target form (rpc on devnet) is ignored the same way", async () => {
    const dir = workspace(CONFIGS.rpcDevnet);
    try {
      const { target } = await authorityOf(dir);
      expect(target).toEqual({ mode: "rpc", domain: "kaspa-l1", network: "devnet" });
      const sdk = await Hardkas.open({ cwd: dir });
      try {
        expect({ network: sdk.network, provider: providerOf(sdk) }).toEqual({ network: "devnet", provider: expect.not.stringContaining("Simulated") });
      } finally {
        await sdk.close();
      }
    } finally {
      remove(dir);
    }
  });

  it("WA2-A3 · a plan made by the SDK in the localnet-default workspace belongs to that world (or the node is reported unreachable): never a silent simulator plan", async () => {
    const dir = workspace(CONFIGS.localnetDefault);
    try {
      const sdk = await Hardkas.open({ cwd: dir });
      try {
        const outcome = await outcomeOf(sdk.tx.plan({ from: "alice", to: "bob", amount: "1" }), (p: any) => ({
          mode: p.mode,
          networkId: p.networkId,
          execution: p.execution,
          from: p.from?.address,
          plannerAuthority: p.ctx?.plannerAuthority ?? p.plannerAuthority ?? null
        }));
        // the hermetic run has no node: an honest SDK either refuses (the localnet endpoint is unreachable) or plans for simnet
        expect(outcome, JSON.stringify(outcome)).not.toMatchObject({ kind: "ok", mode: "simulator" });
        if (outcome.kind === "ok") expect(outcome.execution).toMatchObject({ mode: "localnet", network: "simnet" });
      } finally {
        await sdk.close();
      }
    } finally {
      remove(dir);
    }
  });

  it("WA2-A4 · one call, one authority: the account identity and the execution world of an SDK plan come from the same target", async () => {
    // tx.plan resolves the account WITHOUT a target (accounts follow `execution`) and the world from `defaultNetwork`
    const dir = workspace(CONFIGS.localnetDefault);
    try {
      const sdk = await Hardkas.open({ cwd: dir });
      try {
        const alice: any = await sdk.accounts.resolve("alice");
        const plan = await outcomeOf(sdk.tx.plan({ from: "alice", to: "bob", amount: "1" }), (p: any) => ({ mode: p.mode, networkId: p.networkId, from: p.from?.address }));
        const picture = { alice: { kind: alice.kind, network: alice.network ?? null, address: alice.address }, plan };
        if (plan.kind === "ok") {
          const synthetic = typeof plan.from === "string" && plan.from.startsWith("kaspa:sim_");
          // a simulator plan must spend a synthetic identity; a localnet plan a kaspa identity — never crossed
          expect(plan.mode === "simulator" ? synthetic : !synthetic, JSON.stringify(picture)).toBe(true);
          expect(alice.kind === "synthetic" ? "simulator" : "localnet", JSON.stringify(picture)).toBe(plan.mode);
        }
      } finally {
        await sdk.close();
      }
    } finally {
      remove(dir);
    }
  });

  it("WA2-A5 · a target NAME given as `network` ('localnet', as the config names it) is refused as what it is — not a network — and never becomes one", async () => {
    // Without allowPublic the public-network guard happens to stop it ("treated as a public or external network": the
    // wrong reason — see control C5). With the guard switched off through the SDK's own policy option (the config form,
    // `network.allowPublic: true`, is refused by the loader unless `experimental: true`), nothing else stands in the way.
    const dir = workspace(CONFIGS.scaffold);
    try {
      const outcome = await outcomeOf(
        Hardkas.open({ cwd: dir, network: "localnet", policy: { allowPublic: true } }).then(async (sdk) => {
          const seen = { network: sdk.network, provider: providerOf(sdk), rpcUrl: (sdk as any).resolveRpcUrl?.() ?? null };
          await sdk.close();
          return seen;
        }),
        (seen) => seen
      );
      expect(outcome.kind, JSON.stringify(outcome)).toBe("refused");
      expect(outcome).not.toMatchObject({ code: "PUBLIC_NETWORK_BLOCKED" });
    } finally {
      remove(dir);
    }
  });

  it("WA2-A7 · downstream of the mixed plan: a simulator plan over a kaspa identity is never signed and executed into a receipt", async () => {
    const dir = workspace(CONFIGS.localnetDefault);
    try {
      const sdk = await Hardkas.open({ cwd: dir });
      try {
        const plan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
        const signed = await outcomeOf(sdk.tx.sign(plan, "alice"), (s: any) => ({ signerAddress: s.signerAddress ?? s.from?.address ?? null, format: s.signedTransaction?.format ?? null }));
        const sent =
          signed.kind === "ok"
            ? await outcomeOf(sdk.tx.send(await sdk.tx.sign(plan, "alice")), (r: any) => ({ receipt: Boolean(r?.receipt), mode: r?.mode ?? r?.receipt?.mode ?? null, simulated: r?.simulated ?? null }))
            : { kind: "not-reached" as const };
        const picture = { plan: { mode: plan.mode, from: plan.from?.address }, signed, sent };
        expect(sent, JSON.stringify(picture)).not.toMatchObject({ kind: "ok", receipt: true });
      } finally {
        await sdk.close();
      }
    } finally {
      remove(dir);
    }
  });

  it("WA2-A6 · the loaded config carries one authority: the legacy mirror never contradicts the declared execution target", async () => {
    const dir = workspace(CONFIGS.localnetDefault);
    try {
      const { loaded, target } = await authorityOf(dir);
      const mirror = loaded.config.defaultNetwork;
      expect(mirror === undefined || mirror === target.network, `defaultNetwork=${String(mirror)} while execution resolves to ${target.network}`).toBe(true);
    } finally {
      remove(dir);
    }
  });
});

describe("WORKSPACE-AUTHORITY-2 · controls (green before and after)", () => {
  it("C1 · the scaffold default (simulator): SDK and resolver agree, and a plan is a simulator plan over synthetic identities", async () => {
    const dir = workspace(CONFIGS.scaffold);
    try {
      const { target } = await authorityOf(dir);
      expect(target).toEqual({ mode: "simulator", domain: "kaspa-l1", network: "simulated" });
      const sdk = await Hardkas.open({ cwd: dir });
      try {
        expect({ network: sdk.network, provider: providerOf(sdk) }).toEqual({ network: "simulated", provider: "LocalnetSimulatedProvider" });
        const plan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
        expect({ mode: plan.mode, networkId: plan.networkId, from: plan.from.address }).toEqual({ mode: "simulator", networkId: "simulated", from: "kaspa:sim_alice" });
      } finally {
        await sdk.close();
      }
    } finally {
      remove(dir);
    }
  });

  it("C2 · the legacy key alone (defaultNetwork: simnet): both sides infer the localnet node", async () => {
    const dir = workspace(CONFIGS.legacySimnet);
    try {
      const { target } = await authorityOf(dir);
      expect(target).toEqual({ mode: "localnet", domain: "kaspa-l1", network: "simnet" });
      const sdk = await Hardkas.open({ cwd: dir });
      try {
        expect({ network: sdk.network, provider: providerOf(sdk) }).toEqual({ network: "simnet", provider: expect.not.stringContaining("Simulated") });
      } finally {
        await sdk.close();
      }
    } finally {
      remove(dir);
    }
  });

  it("C3 · the one SDK option that exists, `network`, is honoured: simnet over the scaffold default, simulated over the localnet default", async () => {
    const a = workspace(CONFIGS.scaffold);
    const b = workspace(CONFIGS.localnetDefault);
    try {
      const simnet = await Hardkas.open({ cwd: a, network: "simnet" });
      try {
        expect({ network: simnet.network, provider: providerOf(simnet) }).toEqual({ network: "simnet", provider: expect.not.stringContaining("Simulated") });
      } finally {
        await simnet.close();
      }
      const simulated = await Hardkas.open({ cwd: b, network: "simulated" });
      try {
        expect({ network: simulated.network, provider: providerOf(simulated) }).toEqual({ network: "simulated", provider: "LocalnetSimulatedProvider" });
      } finally {
        await simulated.close();
      }
    } finally {
      remove(a);
      remove(b);
    }
  });

  it("C5 · without allowPublic, the target name 'localnet' as `network` is stopped — by the public-network guard, i.e. for the wrong reason", async () => {
    const dir = workspace(CONFIGS.scaffold);
    try {
      const outcome = await outcomeOf(
        Hardkas.open({ cwd: dir, network: "localnet" }).then(async (sdk) => {
          await sdk.close();
          return {};
        }),
        () => ({})
      );
      expect(outcome).toMatchObject({ kind: "refused", code: "PUBLIC_NETWORK_BLOCKED" });
    } finally {
      remove(dir);
    }
  });

  it("C4 · the public-network guard holds on the honoured path: `network: mainnet` without allowPublic is refused before anything opens", async () => {
    const dir = workspace(CONFIGS.scaffold);
    try {
      const outcome = await outcomeOf(
        Hardkas.open({ cwd: dir, network: "mainnet" }).then(async (sdk) => {
          await sdk.close();
          return {};
        }),
        () => ({})
      );
      expect(outcome).toMatchObject({ kind: "refused", code: "PUBLIC_NETWORK_BLOCKED" });
    } finally {
      remove(dir);
    }
  });
});
