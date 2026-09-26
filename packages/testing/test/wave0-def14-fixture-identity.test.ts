import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  HardkasFixtureSigner,
  HARDKAS_FIXTURE_DERIVATION_DOMAIN,
  HARDKAS_FIXTURE_NAMES,
  HARDKAS_FIXTURE_REGISTRY,
  getHardkasFixtureKey
} from "../src/fixture-signer.js";

const HISTORIC_RFC_VECTOR =
  "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";

describe("DEF-14 · fixture registry — bounded, auditable, closed set", () => {
  it("registry lists exactly the six well-known dev fixtures", () => {
    expect([...HARDKAS_FIXTURE_NAMES].sort()).toEqual(
      ["alice", "bob", "carol", "dave", "default", "erin"]
    );
  });

  it("every registry entry is a 64-hex-char string", () => {
    for (const name of HARDKAS_FIXTURE_NAMES) {
      const k = HARDKAS_FIXTURE_REGISTRY[name];
      expect(/^[0-9a-f]{64}$/.test(k)).toBe(true);
    }
  });

  it("no registered fixture collapses to the historic RFC 6979 test vector", () => {
    for (const name of HARDKAS_FIXTURE_NAMES) {
      expect(HARDKAS_FIXTURE_REGISTRY[name] === HISTORIC_RFC_VECTOR).toBe(false);
    }
  });

  it("all six registered fixtures have DISTINCT private keys", () => {
    const values = HARDKAS_FIXTURE_NAMES.map((n) => HARDKAS_FIXTURE_REGISTRY[n]);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("registry values are recomputable — audit trail via SHA-256 over the documented domain", () => {
    // Anyone can verify a registry entry with: sha256("hardkas-dev-fixture:v1\0<name>")
    for (const name of HARDKAS_FIXTURE_NAMES) {
      const material = `${HARDKAS_FIXTURE_DERIVATION_DOMAIN}\0${name}`;
      const expected = createHash("sha256").update(material, "utf8").digest("hex");
      expect(HARDKAS_FIXTURE_REGISTRY[name]).toBe(expected);
    }
  });

  it("registry object is frozen (cannot be mutated at runtime)", () => {
    expect(Object.isFrozen(HARDKAS_FIXTURE_REGISTRY)).toBe(true);
    // Explicitly reject in-place mutation.
    let mutationRejected = false;
    try {
      (HARDKAS_FIXTURE_REGISTRY as any).alice = "0".repeat(64);
    } catch {
      mutationRejected = true;
    }
    // Strict mode throws; non-strict silently no-ops. Either way, the value is unchanged.
    expect(HARDKAS_FIXTURE_REGISTRY.alice !== "0".repeat(64)).toBe(true);
  });
});

describe("DEF-14 · getHardkasFixtureKey — closed-set lookup", () => {
  it("returns the registry value for each known name", () => {
    for (const name of HARDKAS_FIXTURE_NAMES) {
      expect(getHardkasFixtureKey(name)).toBe(HARDKAS_FIXTURE_REGISTRY[name]);
    }
  });

  it("fails closed on typo — 'alixe' is not accepted", () => {
    let thrown: any;
    try {
      getHardkasFixtureKey("alixe" as any);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe("HARDKAS_UNKNOWN_FIXTURE");
    expect(thrown.message.includes("alixe")).toBe(true);
    expect(thrown.message.includes("alice")).toBe(true); // Known-list contains suggestion.
  });

  it("fails closed on arbitrary user string — no side-channel derivation", () => {
    for (const bad of ["", "wave0_a", "some_random_name", "eve", "attacker"]) {
      let thrown: any;
      try {
        getHardkasFixtureKey(bad as any);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeDefined();
      expect(thrown.code).toBe("HARDKAS_UNKNOWN_FIXTURE");
    }
  });
});

describe("DEF-14 · HardkasFixtureSigner — bounded fixture identities", () => {
  it("distinct known fixtures produce distinct simnet addresses", async () => {
    const alice = new HardkasFixtureSigner("simnet", "alice");
    const bob = new HardkasFixtureSigner("simnet", "bob");
    const carol = new HardkasFixtureSigner("simnet", "carol");
    const a = await alice.getAddress();
    const b = await bob.getAddress();
    const c = await carol.getAddress();
    expect(a === b).toBe(false);
    expect(b === c).toBe(false);
    expect(a === c).toBe(false);
    for (const addr of [a, b, c]) expect(addr.startsWith("kaspasim:")).toBe(true);
  });

  it("same fixture name is deterministic across signer instances", async () => {
    const a1 = new HardkasFixtureSigner("simnet", "alice");
    const a2 = new HardkasFixtureSigner("simnet", "alice");
    expect(await a1.getAddress()).toBe(await a2.getAddress());
  });

  it("default identity is stable across the two ways to construct it", async () => {
    const d1 = new HardkasFixtureSigner("simnet");
    const d2 = new HardkasFixtureSigner("simnet", "default");
    expect(await d1.getAddress()).toBe(await d2.getAddress());
  });

  it("default is not aliased to any explicitly named fixture", async () => {
    const def = new HardkasFixtureSigner("simnet");
    const alice = new HardkasFixtureSigner("simnet", "alice");
    expect(await def.getAddress() === (await alice.getAddress())).toBe(false);
  });

  it("mainnet is refused at construction (regardless of fixture)", () => {
    expect(() => new HardkasFixtureSigner("mainnet")).toThrow(/mainnet/i);
    expect(() => new HardkasFixtureSigner("mainnet", "alice")).toThrow(/mainnet/i);
  });

  it("arbitrary fixture name is refused at construction (registry-gated)", () => {
    let thrown: any;
    try {
      new HardkasFixtureSigner("simnet", "wave0_a");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe("HARDKAS_UNKNOWN_FIXTURE");
  });

  it("networkId and fixtureName are exposed and match the constructor arguments", () => {
    const s = new HardkasFixtureSigner("testnet-10", "carol");
    expect(s.networkId).toBe("testnet-10");
    expect(s.fixtureName).toBe("carol");
  });

  it("fixture addresses are deterministic across fresh Node processes", () => {
    const script = `import { HardkasFixtureSigner } from "@hardkas/testing"; const s = new HardkasFixtureSigner("simnet", "alice"); console.log(await s.getAddress());`;
    const out1 = execSync(`node --input-type=module -e "${script.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
      cwd: process.cwd()
    }).trim();
    const out2 = execSync(`node --input-type=module -e "${script.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
      cwd: process.cwd()
    }).trim();
    expect(out1).toBe(out2);
    expect(out1.startsWith("kaspasim:")).toBe(true);
  });
});
