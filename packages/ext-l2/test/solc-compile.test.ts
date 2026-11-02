import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SOLC_REFERENCES, SOLC_LONG_VERSION, solcReferenceFor } from "../src/toolchains/solc.js";
import { forgeEnv, forgeBuildArgs, collectContracts, compareBuilds, assertPinnedCompiler, OFFLINE_PROXY, type L2BuildManifest } from "../src/compile/forge-build.js";

// L2-EXT stage 5 · the solc pin and the offline-compile mechanics that need no binary (the real forge/solc runs are in
// solc-real.foundry.test.ts).

describe("solc 0.8.38 pin", () => {
  it("win32-x64 and linux-x64 only, each a single official binary whose file digest is the asset digest", () => {
    expect(Object.keys(SOLC_REFERENCES).sort()).toEqual(["linux-x64", "win32-x64"]);
    for (const ref of Object.values(SOLC_REFERENCES)) {
      expect(ref).toMatchObject({ id: "solc", version: "0.8.38", archive: "binary", assetSubdir: "" });
      expect(Object.keys(ref.files)).toEqual([ref.entry]);
      expect(ref.files[ref.entry]!.sha256).toBe(ref.assetSha256);
      expect(ref.assetSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(ref.url.startsWith("https://binaries.soliditylang.org/")).toBe(true);
      expect(ref.url.endsWith(ref.assetName)).toBe(true);
      expect(ref.assetName).toContain(`v${SOLC_LONG_VERSION}`);
    }
    // the values cross-checked on 1-nov against list.json and the GitHub release digests (SOLC_RESEARCH.md)
    expect(SOLC_REFERENCES["win32-x64"]!.assetSha256).toBe("3fb6699791d7eb9d8cb28168116cc9b5eca9f2bec1ec356f7d66034d91035e9b");
    expect(SOLC_REFERENCES["linux-x64"]!.assetSha256).toBe("65c3180a336eabb6bdc4bbd49cc405aeb233976964ae6c11fba2a6c8be8f3243");
  });

  it("not offered on musl, macOS or ARM (rather than unverified)", () => {
    expect(solcReferenceFor("linux", "x64", true)).toBeUndefined();
    expect(solcReferenceFor("darwin", "arm64", false)).toBeUndefined();
    expect(solcReferenceFor("linux", "arm64", false)).toBeUndefined();
    expect(solcReferenceFor("win32", "x64", false)).toBe(SOLC_REFERENCES["win32-x64"]);
  });
});

describe("offline compile mechanics", () => {
  it("forge runs offline with the verified solc, whatever foundry.toml says", () => {
    const args = forgeBuildArgs("/p", "/home/solc", "/p/out", "/p/cache");
    expect(args.slice(0, 1)).toEqual(["build"]);
    expect(args).toContain("--offline");
    expect(args[args.indexOf("--use") + 1]).toBe("/home/solc");
    expect(args[args.indexOf("--root") + 1]).toBe("/p");
  });

  it("forge's environment: every FOUNDRY_*/DAPP_* override dropped, offline set, proxies at a closed loopback port", () => {
    const env = forgeEnv({
      PATH: "x",
      FOUNDRY_SOLC_VERSION: "0.8.19",
      FOUNDRY_AUTO_DETECT_SOLC: "true",
      foundry_offline: "false",
      DAPP_SOLC_VERSION: "0.8.19",
      HTTPS_PROXY: "http://evil.example:8080",
      no_proxy: "*"
    });
    expect(Object.keys(env).filter((k) => /^(FOUNDRY_|DAPP_)/i.test(k))).toEqual(["FOUNDRY_OFFLINE"]);
    expect(env.FOUNDRY_OFFLINE).toBe("true");
    for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) expect(env[k]).toBe(OFFLINE_PROXY);
    expect(OFFLINE_PROXY).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect([env.NO_PROXY, env.no_proxy]).toEqual(["", ""]);
    expect(env.PATH).toBe("x");
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-solc-unit-"));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const artifact = (dir: string, file: string, source: string, name: string, bytecode: string, compiler = SOLC_LONG_VERSION, evm = "cancun") => {
    fs.mkdirSync(path.join(dir, file), { recursive: true });
    fs.writeFileSync(
      path.join(dir, file, `${name}.json`),
      JSON.stringify({
        bytecode: { object: bytecode },
        deployedBytecode: { object: bytecode + "ff" },
        metadata: { compiler: { version: compiler }, settings: { compilationTarget: { [source]: name }, evmVersion: evm } }
      })
    );
  };

  it("collects every contract with the compiler and EVM version that really built it (build-info ignored)", () => {
    const out = path.join(tmp, "out1");
    artifact(out, "Counter.sol", "src/Counter.sol", "Counter", "0x6080");
    artifact(out, "Counter.t.sol", "test/Counter.t.sol", "CounterTest", "0x6081", "0.8.19+commit.7dd6d404", "paris");
    fs.mkdirSync(path.join(out, "build-info"), { recursive: true });
    fs.writeFileSync(path.join(out, "build-info", "x.json"), "{}");
    const c = collectContracts(out);
    expect(Object.keys(c.contracts).sort()).toEqual(["src/Counter.sol:Counter", "test/Counter.t.sol:CounterTest"]);
    expect([...c.compilers].sort()).toEqual([SOLC_LONG_VERSION, "0.8.19+commit.7dd6d404"].sort());
    expect([...c.evmVersions].sort()).toEqual(["cancun", "paris"]);
  });

  it("the compiler read back from the artifacts must be the pinned one: another one, or none recorded, is L2_COMPILER_MISMATCH", () => {
    expect(() => assertPinnedCompiler(new Set([SOLC_LONG_VERSION]))).not.toThrow();
    for (const set of [new Set([SOLC_LONG_VERSION, "0.8.19+commit.7dd6d404"]), new Set(["0.8.37+commit.f401782d"]), new Set<string>()]) {
      expect(() => assertPinnedCompiler(set)).toThrow(expect.objectContaining({ code: "L2_COMPILER_MISMATCH" }));
    }
  });

  it("compareBuilds names every difference (bytecode, compiler, EVM version, contracts added or gone); none when identical", () => {
    const base: L2BuildManifest = {
      schema: "hardkas.l2Build.v1",
      solc: { version: SOLC_LONG_VERSION, sha256: "a" },
      forge: { version: "1.8.6", sha256: "b" },
      evmVersions: ["cancun"],
      contracts: { "src/A.sol:A": { bytecodeSha256: "1", deployedBytecodeSha256: "2" }, "src/B.sol:B": { bytecodeSha256: "3", deployedBytecodeSha256: "4" } }
    };
    expect(compareBuilds(base, structuredClone(base))).toEqual([]);
    const changed: L2BuildManifest = {
      ...base,
      solc: { version: "0.8.37", sha256: "z" },
      evmVersions: ["prague"],
      contracts: { "src/A.sol:A": { bytecodeSha256: "1", deployedBytecodeSha256: "X" }, "src/C.sol:C": { bytecodeSha256: "5", deployedBytecodeSha256: "6" } }
    };
    expect(compareBuilds(base, changed)).toEqual([
      `solc: ${SOLC_LONG_VERSION} → 0.8.37`,
      "evm version: cancun → prague",
      "src/A.sol:A: runtime bytecode differs",
      "src/B.sol:B: missing from the rebuild",
      "src/C.sol:C: not in the recorded build"
    ]);
  });
});
