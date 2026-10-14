import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";
import { loadHardkasConfig, resolveNewIntentTarget, resolveProvider, resolveWorkspaceExecution } from "@hardkas/config";
import { expectedScriptPublicKeyHex } from "@hardkas/artifacts";

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
        // BEFORE: the plan existed (a simulator plan over the kaspa alice). AFTER C-A the SDK runs on the declared
        // localnet and asks the node, which the hermetic run refuses: no plan, nothing downstream to check.
        const planned = await outcomeOf(sdk.tx.plan({ from: "alice", to: "bob", amount: "1" }), (p: any) => ({ plan: p }));
        if (planned.kind !== "ok") {
          expect(planned, JSON.stringify(planned)).not.toMatchObject({ code: "SIGNER_MISMATCH" });
          return;
        }
        const plan: any = (planned as any).plan;
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

  it("C5 · without allowPublic, the target name 'localnet' as `network` is refused — BEFORE by the public-network guard (the wrong reason, `before/logs`), AFTER as what it is: not a network", async () => {
    const dir = workspace(CONFIGS.scaffold);
    try {
      const outcome = await outcomeOf(
        Hardkas.open({ cwd: dir, network: "localnet" }).then(async (sdk) => {
          await sdk.close();
          return {};
        }),
        () => ({})
      );
      expect(outcome).toMatchObject({ kind: "refused", code: "UNKNOWN_NETWORK" });
    } finally {
      remove(dir);
    }
  });

  it("C4 · the public-network guard holds on the honoured path: `network: mainnet` without allowPublic is refused before anything opens (and so is a public network declared by `execution`)", async () => {
    const declared = workspace(`export default { execution: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } };\n`);
    try {
      const outcome = await outcomeOf(
        Hardkas.open({ cwd: declared }).then(async (sdk) => {
          await sdk.close();
          return {};
        }),
        () => ({})
      );
      expect(outcome, "the declared public network is honoured and therefore guarded, never silently simulated").toMatchObject({ kind: "refused", code: "PUBLIC_NETWORK_BLOCKED" });
    } finally {
      remove(declared);
    }
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

// AFTER (C-A, reviewer's GO 2026-10-10): one resolver for the SDK and the CLI (`resolveWorkspaceExecution`, @hardkas/config);
// `target` names a target, `network` is a network id, both must agree; the legacy key is a derived mirror; the
// identities and the world of a plan come from the one resolved target, checked before any plan exists.
describe("WORKSPACE-AUTHORITY-2 · AFTER · one workspace, one execution authority", () => {
  const tree = (dir: string) => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        out.push(path.relative(dir, p).split(path.sep).join("/") + (e.isDirectory() ? "/" : ""));
        if (e.isDirectory()) walk(p);
      }
    };
    walk(dir);
    return out.sort();
  };
  const opened = (dir: string, options: Record<string, unknown> = {}) =>
    outcomeOf(
      Hardkas.open({ cwd: dir, ...options }).then(async (sdk) => {
        const seen = { network: sdk.network as string, mode: sdk.execution.mode, source: sdk.executionSource, provider: providerOf(sdk) };
        await sdk.close();
        return seen;
      }),
      (seen) => seen
    );

  it("WA2-T1 · `target` selects a named target: localnet over the scaffold default, the simulator over a localnet default", async () => {
    const a = workspace(CONFIGS.scaffold);
    const b = workspace(CONFIGS.localnetDefault);
    try {
      expect(await opened(a, { target: "localnet" })).toMatchObject({ kind: "ok", network: "simnet", mode: "localnet", source: "target", provider: expect.not.stringContaining("Simulated") });
      expect(await opened(b, { target: "simulator" })).toMatchObject({ kind: "ok", network: "simulated", mode: "simulator", source: "target", provider: "LocalnetSimulatedProvider" });
    } finally {
      remove(a);
      remove(b);
    }
  });

  it("WA2-T2 · a target that does not exist is a typed refusal, in both config forms", async () => {
    const a = workspace(CONFIGS.scaffold);
    const b = workspace(CONFIGS.rpcDevnet);
    try {
      expect(await opened(a, { target: "nope" })).toMatchObject({ kind: "refused", code: "EXECUTION_TARGET_NOT_FOUND" });
      expect(await opened(b, { target: "localnet" })).toMatchObject({ kind: "refused", code: "EXECUTION_TARGET_NOT_FOUND" });
    } finally {
      remove(a);
      remove(b);
    }
  });

  it("WA2-T3 · `network` is a network id: an unknown name is UNKNOWN_NETWORK, a target name too (even with the public guard off)", async () => {
    const dir = workspace(CONFIGS.scaffold);
    try {
      expect(await opened(dir, { network: "nonsense" })).toMatchObject({ kind: "refused", code: "UNKNOWN_NETWORK" });
      const asTarget = await opened(dir, { network: "localnet", policy: { allowPublic: true } });
      expect(asTarget).toMatchObject({ kind: "refused", code: "UNKNOWN_NETWORK" });
      expect(String((asTarget as any).message)).toMatch(/named execution target/);
    } finally {
      remove(dir);
    }
  });

  it("WA2-T4 · `target` and `network` together must agree: a disagreement is EXECUTION_NETWORK_MISMATCH, agreement opens", async () => {
    const dir = workspace(CONFIGS.scaffold);
    try {
      expect(await opened(dir, { target: "localnet", network: "simulated" })).toMatchObject({ kind: "refused", code: "EXECUTION_NETWORK_MISMATCH" });
      expect(await opened(dir, { target: "localnet", network: "simnet" })).toMatchObject({ kind: "ok", network: "simnet", mode: "localnet", source: "target" });
    } finally {
      remove(dir);
    }
  });

  it("WA2-T5 · the explicit `network` override keeps its destination: simulated, simnet and devnet open where they always did", async () => {
    const dir = workspace(CONFIGS.scaffold);
    try {
      expect(await opened(dir, { network: "simulated" })).toMatchObject({ kind: "ok", network: "simulated", mode: "simulator", source: "network", provider: "LocalnetSimulatedProvider" });
      expect(await opened(dir, { network: "simnet" })).toMatchObject({ kind: "ok", network: "simnet", mode: "localnet", source: "network", provider: expect.not.stringContaining("Simulated") });
      expect(await opened(dir, { network: "devnet" })).toMatchObject({ kind: "ok", network: "devnet", mode: "localnet", source: "network", provider: expect.not.stringContaining("Simulated") });
    } finally {
      remove(dir);
    }
  });

  it("WA2-T6 · legacy configs keep their documented resolution: `defaultNetwork` alone still decides, and the loader leaves them untouched", async () => {
    const simulated = workspace(`export default { defaultNetwork: "simulated" };\n`);
    const devnet = workspace(`export default { defaultNetwork: "devnet" };\n`);
    try {
      expect(await opened(simulated)).toMatchObject({ kind: "ok", network: "simulated", mode: "simulator", source: "defaultNetwork", provider: "LocalnetSimulatedProvider" });
      expect(await opened(devnet)).toMatchObject({ kind: "ok", network: "devnet", mode: "localnet", source: "defaultNetwork" });
      const { loaded } = await authorityOf(devnet);
      expect({ execution: loaded.config.execution, defaultNetwork: loaded.config.defaultNetwork }).toEqual({ execution: undefined, defaultNetwork: "devnet" });
    } finally {
      remove(simulated);
      remove(devnet);
    }
  });

  it("WA2-T7 · the loader's mirror is derived from the declared default target, in memory, for every form of the contract", async () => {
    const cases: Array<[string, string]> = [
      [CONFIGS.scaffold, "simulated"],
      [CONFIGS.localnetDefault, "simnet"],
      [CONFIGS.rpcDevnet, "devnet"]
    ];
    for (const [body, expected] of cases) {
      const dir = workspace(body);
      try {
        const { loaded } = await authorityOf(dir);
        expect(loaded.config.defaultNetwork, body).toBe(expected);
        expect(fs.readFileSync(path.join(dir, "hardkas.config.ts"), "utf8"), "the file is never rewritten").toBe(body);
      } finally {
        remove(dir);
      }
    }
  });

  it("WA2-T8 · the identities follow the instance's world: synthetic under an explicit simulated override of a localnet default, kaspa under the localnet target of the scaffold", async () => {
    const a = workspace(CONFIGS.localnetDefault);
    const b = workspace(CONFIGS.scaffold);
    try {
      const simulated = await Hardkas.open({ cwd: a, network: "simulated" });
      try {
        const alice: any = await simulated.accounts.resolve("alice");
        expect({ kind: alice.kind, address: alice.address }).toEqual({ kind: "synthetic", address: "kaspa:sim_alice" });
        const plan: any = await simulated.tx.plan({ from: "alice", to: "bob", amount: "1" });
        expect({ mode: plan.mode, networkId: plan.networkId, from: plan.from.address }).toEqual({ mode: "simulator", networkId: "simulated", from: "kaspa:sim_alice" });
      } finally {
        await simulated.close();
      }
      const localnet = await Hardkas.open({ cwd: b, target: "localnet" });
      try {
        const alice: any = await localnet.accounts.resolve("alice");
        expect({ kind: alice.kind, network: alice.network }).toEqual({ kind: "kaspa", network: "simnet" });
        const listed = (await localnet.accounts.list()) as any[];
        expect(listed.find((x) => x.name === "alice")?.kind).toBe("kaspa");
      } finally {
        await localnet.close();
      }
    } finally {
      remove(a);
      remove(b);
    }
  });

  it("WA2-T9 · an identity of another world is refused BEFORE any plan exists, with the world named, and nothing is written", async () => {
    const dir = workspace(CONFIGS.scaffold); // the simulator
    try {
      const sdk = await Hardkas.open({ cwd: dir });
      try {
        await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" }); // warms the simulated state, so the tree below is stable
        const before = tree(dir);
        const kaspaAlice = { name: "alice", kind: "kaspa", network: "simnet", address: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn" } as any;
        const byObject = await outcomeOf(sdk.tx.plan({ from: kaspaAlice, to: "bob", amount: "1" }), (p: any) => ({ mode: p.mode }));
        const byAddress = await outcomeOf(sdk.tx.plan({ from: "alice", to: "kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980", amount: "1" }), (p: any) => ({ mode: p.mode }));
        expect(byObject).toMatchObject({ kind: "refused", code: "ACCOUNT_NETWORK_MISMATCH" });
        expect(String((byObject as any).message), "the refusal names the two worlds").toMatch(/simulated.*simnet|simnet.*simulated/i);
        expect(byAddress).toMatchObject({ kind: "refused", code: "ACCOUNT_NETWORK_MISMATCH" });
        expect(tree(dir), "no plan, no file").toEqual(before);
      } finally {
        await sdk.close();
      }
    } finally {
      remove(dir);
    }
  });

  // Closeout (reviewer's bounded GO, 2026-10-10): the probes of the qualification hold found three ways out of the
  // authority — `createConsolidationPlan` (no account/world check; a per-call `network` re-pointing the plan),
  // `observe.address({ target })` (an observation of another world taken from this instance's provider) and the CLI's
  // endpoint (the canonical localnet URL substituted for the one the network declares). Each is pinned here: red against
  // the implementation the hold reviewed, green after the three minimal fixes.
  describe("closeout · a per-call override never moves an instance to another world; the endpoint is the resolved one", () => {
    const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
    const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
    const external = { name: FROM, kind: "external-wallet", network: "simnet", address: FROM } as any;
    const realUtxos = () => [
      { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: expectedScriptPublicKeyHex(FROM), blockDaaScore: 1000n, isCoinbase: false },
      { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: FROM, amountSompi: 500_000_000n, scriptPublicKey: expectedScriptPublicKeyHex(FROM), blockDaaScore: 1200n, isCoinbase: false }
    ];
    const CUSTOM_SIMNET_URL = `export default { execution: { default: "localnet", ${SCAFFOLD_TARGETS} }, networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } } };\n`;
    const consolidation = (sdk: Hardkas, opts: Record<string, unknown>) =>
      outcomeOf((sdk.tx as any).createConsolidationPlan(opts), (p: any) => ({ mode: p.mode, networkId: p.networkId, from: p.from?.address, inputs: p.inputs?.length }));
    const CANONICAL = "ws://127.0.0.1:18210";

    it("X1 · P1: a simulated instance, an identity of simnet, real UTXOs and `network: simnet` → refused before any plan, nothing written", async () => {
      const dir = workspace(CONFIGS.scaffold);
      try {
        const sdk = await Hardkas.open({ cwd: dir });
        try {
          const before = tree(dir);
          const outcome = await consolidation(sdk, { account: external, selectedUtxos: realUtxos(), destination: TO, network: "simnet" });
          expect(outcome, JSON.stringify(outcome)).toMatchObject({ kind: "refused", code: "EXECUTION_NETWORK_MISMATCH" });
          expect(tree(dir)).toEqual(before);
        } finally {
          await sdk.close();
        }
      } finally {
        remove(dir);
      }
    });

    it("X2 · P2: the same identity without an override → the account/world rule refuses it (ACCOUNT_NETWORK_MISMATCH), nothing written", async () => {
      const dir = workspace(CONFIGS.scaffold);
      try {
        const sdk = await Hardkas.open({ cwd: dir });
        try {
          const before = tree(dir);
          const outcome = await consolidation(sdk, { account: external, selectedUtxos: realUtxos(), destination: TO });
          expect(outcome, JSON.stringify(outcome)).toMatchObject({ kind: "refused", code: "ACCOUNT_NETWORK_MISMATCH" });
          expect(tree(dir)).toEqual(before);
        } finally {
          await sdk.close();
        }
      } finally {
        remove(dir);
      }
    });

    it("X3 · P3: the instance's own alice with `network: simnet` → EXECUTION_NETWORK_MISMATCH; an unknown network → UNKNOWN_NETWORK; nothing written", async () => {
      const dir = workspace(CONFIGS.scaffold);
      try {
        const sdk = await Hardkas.open({ cwd: dir });
        try {
          const before = tree(dir);
          expect(await consolidation(sdk, { account: "alice", selectedUtxos: realUtxos(), destination: "kaspa:sim_bob", network: "simnet" })).toMatchObject({ kind: "refused", code: "EXECUTION_NETWORK_MISMATCH" });
          expect(await consolidation(sdk, { account: "alice", selectedUtxos: realUtxos(), destination: "kaspa:sim_bob", network: "nonsense" })).toMatchObject({ kind: "refused", code: "UNKNOWN_NETWORK" });
          expect(tree(dir)).toEqual(before);
        } finally {
          await sdk.close();
        }
      } finally {
        remove(dir);
      }
    });

    it("X4 · UTXOs that are not the account's own are refused before any plan (UTXO_ACCOUNT_MISMATCH)", async () => {
      const dir = workspace(CONFIGS.scaffold);
      try {
        const sdk = await Hardkas.open({ cwd: dir });
        try {
          const before = tree(dir);
          const outcome = await consolidation(sdk, { account: "alice", selectedUtxos: realUtxos(), destination: "kaspa:sim_bob" });
          expect(outcome, JSON.stringify(outcome)).toMatchObject({ kind: "refused", code: "UTXO_ACCOUNT_MISMATCH" });
          expect(tree(dir)).toEqual(before);
        } finally {
          await sdk.close();
        }
      } finally {
        remove(dir);
      }
    });

    it("X5 · control: an instance opened on simnet consolidates a simnet identity's own UTXOs into a localnet plan, with or without naming its own network", async () => {
      const dir = workspace(CONFIGS.scaffold);
      try {
        const sdk = await Hardkas.open({ cwd: dir, network: "simnet" });
        try {
          const named = await consolidation(sdk, { account: external, selectedUtxos: realUtxos(), destination: TO, network: "simnet" });
          expect(named, JSON.stringify(named)).toMatchObject({ kind: "ok", mode: "localnet", networkId: "simnet", from: FROM, inputs: 2 });
          const unnamed = await consolidation(sdk, { account: external, selectedUtxos: realUtxos(), destination: TO });
          expect(unnamed, JSON.stringify(unnamed)).toMatchObject({ kind: "ok", mode: "localnet", networkId: "simnet", from: FROM, inputs: 2 });
          // and that instance cannot be moved to the simulator by one call either
          expect(await consolidation(sdk, { account: external, selectedUtxos: realUtxos(), destination: TO, network: "simulated" })).toMatchObject({ kind: "refused", code: "EXECUTION_NETWORK_MISMATCH" });
        } finally {
          await sdk.close();
        }
      } finally {
        remove(dir);
      }
    });

    it("X6 · observation: a `target` of another world is refused, typed; the instance's own target (or none) observes through its own provider, labelled as its own world; an unknown target is typed", async () => {
      const dir = workspace(CONFIGS.scaffold);
      try {
        const sdk = await Hardkas.open({ cwd: dir });
        try {
          const observe = (opts: Record<string, unknown>) =>
            outcomeOf(sdk.observe.address({ address: "kaspa:sim_alice", ...opts } as any), (o: any) => ({ mode: o?.execution?.mode, network: o?.execution?.network }));
          expect(await observe({ target: "simnet" })).toMatchObject({ kind: "refused", code: "OBSERVATION_TARGET_MISMATCH" });
          expect(await observe({ target: "simulated" })).toMatchObject({ kind: "ok", mode: "simulator", network: "simulated" });
          expect(await observe({})).toMatchObject({ kind: "ok", mode: "simulator", network: "simulated" });
          expect(await observe({ target: "nonsense" })).toMatchObject({ kind: "refused", code: "OBSERVATION_UNKNOWN_TARGET" });
        } finally {
          await sdk.close();
        }
      } finally {
        remove(dir);
      }
    });

    it("X7 · the endpoint is part of the chain: SDK and CLI agree; a declared URL wins over the canonical default (devnet, a custom simnet URL); the default simnet stays canonical; an explicit url still wins", async () => {
      const cases: Array<[string, string, Record<string, string>, string]> = [
        ["scaffold + network devnet", CONFIGS.scaffold, { network: "devnet" }, "ws://127.0.0.1:18610"],
        ["a custom networks.simnet.rpcUrl under a localnet default", CUSTOM_SIMNET_URL, {}, "ws://127.0.0.1:1"],
        ["scaffold + network simnet (the default simnet is the canonical localnet)", CONFIGS.scaffold, { network: "simnet" }, CANONICAL]
      ];
      for (const [label, body, override, expected] of cases) {
        const dir = workspace(body);
        try {
          const loaded = await loadHardkasConfig({ cwd: dir, workspaceRoot: dir });
          const resolved: any = resolveWorkspaceExecution({ config: loaded.config, ...override });
          const cli = resolveProvider({
            network: resolved.networkId,
            configNetworkKind: (loaded.config.networks as any)?.[resolved.networkId]?.kind,
            executionMode: resolved.execution.mode,
            networkRpcUrl: resolved.rpcUrl
          } as any);
          const sdk = await Hardkas.open({ cwd: dir, ...override });
          try {
            expect({ label, resolver: resolved.rpcUrl, cli: cli.endpoint, sdk: (sdk as any).resolveRpcUrl() }).toEqual({ label, resolver: expected, cli: expected, sdk: expected });
          } finally {
            await sdk.close();
          }
        } finally {
          remove(dir);
        }
      }
      expect(resolveProvider({ network: "simnet", executionMode: "localnet", networkRpcUrl: "ws://127.0.0.1:1", url: "ws://127.0.0.1:9" } as any).endpoint, "an explicit url still wins").toBe("ws://127.0.0.1:9");
      expect(resolveProvider({ network: "simulated", executionMode: "simulator" } as any).mode, "the simulator has no endpoint").toBe("simulator");
    });
  });

  it("WA2-T10 · the plan of a localnet-default workspace is a localnet plan or a node refusal — never the simulator (A3, after)", async () => {
    const dir = workspace(CONFIGS.localnetDefault);
    try {
      const sdk = await Hardkas.open({ cwd: dir });
      try {
        expect({ network: sdk.network, mode: sdk.execution.mode, source: sdk.executionSource }).toEqual({ network: "simnet", mode: "localnet", source: "execution" });
        const outcome = await outcomeOf(sdk.tx.plan({ from: "alice", to: "bob", amount: "1" }), (p: any) => ({ mode: p.mode, networkId: p.networkId }));
        expect(outcome, JSON.stringify(outcome)).not.toMatchObject({ kind: "ok", mode: "simulator" });
      } finally {
        await sdk.close();
      }
    } finally {
      remove(dir);
    }
  });
});
