import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SILVERSCRIPT_RELEASE,
  SILVER_COMPILE_PROVENANCE_SCHEMA,
  compileSilverScript,
  getSilContract,
  getSilvercReference,
  getToolchainInstallDir,
  parseSilAbiArtifact,
  resolveManagedSilverc,
  serializeSilArtifactValues,
  silContractBytecodeHex,
  type SilArtifactValue
} from "../src/index.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "silverscript-v1");
const read = (name: string) => fs.readFileSync(path.join(FIXTURES, name));
const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const artifactJson = () => JSON.parse(read("abi-vectors.artifact.json").toString("utf8"));
const OWNER: SilArtifactValue = { kind: "bytes", value: Array.from({ length: 32 }, () => 7) };

describe("parseSilAbiArtifact", () => {
  it("accepts a silverc v1.0.0 artifact", () => {
    const artifact = parseSilAbiArtifact(artifactJson());
    const { name, contract } = getSilContract(artifact);
    expect(name).toBe("AbiVectors");
    expect(Object.keys(contract.entries).sort()).toEqual(["keys", "list", "scalars", "timed"]);
    expect(silContractBytecodeHex(contract)).toMatch(/^[0-9a-f]+$/);
  });

  it("rejects the legacy HardKAS compile shape", () => {
    const legacy = { compiledScriptHex: "51", abi: {}, script: "51", compilerVersion: "unknown" };
    expect(() => parseSilAbiArtifact(legacy)).toThrow(expect.objectContaining({ code: "SILVER_ARTIFACT_SCHEMA_UNSUPPORTED" }));
  });

  it("rejects another schema version or another compiler", () => {
    expect(() => parseSilAbiArtifact({ ...artifactJson(), schema_version: 2 })).toThrow(
      expect.objectContaining({ code: "SILVER_ARTIFACT_SCHEMA_UNSUPPORTED" })
    );
    expect(() => parseSilAbiArtifact({ ...artifactJson(), compiler_version: "0.2.0" })).toThrow(
      expect.objectContaining({ code: "SILVER_ARTIFACT_COMPILER_MISMATCH" })
    );
  });

  it("rejects unknown or missing fields, anywhere", () => {
    const withTop = { ...artifactJson(), extra: 1 };
    expect(() => parseSilAbiArtifact(withTop)).toThrow(/unknown field 'extra'/);

    const inContract = artifactJson();
    inContract.contracts.AbiVectors.scriptHex = "51";
    expect(() => parseSilAbiArtifact(inContract)).toThrow(/unknown field 'scriptHex'/);

    const noBytecode = artifactJson();
    delete noBytecode.contracts.AbiVectors.compiled.bytecode;
    expect(() => parseSilAbiArtifact(noBytecode)).toThrow(/missing field 'bytecode'/);
  });

  it("rejects malformed contents", () => {
    const cases: Array<[string, (a: any) => void]> = [
      ["empty bytecode", (a) => (a.contracts.AbiVectors.compiled.bytecode = [])],
      ["non-byte bytecode", (a) => (a.contracts.AbiVectors.compiled.bytecode = [1, 256])],
      ["short template hash", (a) => (a.contracts.AbiVectors.compiled.template_hash = [1, 2, 3])],
      ["state span outside bytecode", (a) => (a.contracts.AbiVectors.compiled.state_span = { offset: 0, len: 10_000 })],
      ["bad dispatch tag", (a) => (a.contracts.AbiVectors.entries.keys.dispatch_tag = "xyz")],
      ["duplicate dispatch tag", (a) => (a.contracts.AbiVectors.entries.keys.dispatch_tag = a.contracts.AbiVectors.entries.list.dispatch_tag)],
      ["unknown type kind", (a) => (a.contracts.AbiVectors.entries.timed.params[0].type = { kind: "float" })],
      ["no contracts", (a) => (a.contracts = {})]
    ];
    for (const [label, mutate] of cases) {
      const a = artifactJson();
      mutate(a);
      expect(() => parseSilAbiArtifact(a), label).toThrow(expect.objectContaining({ code: "SILVER_ARTIFACT_INVALID" }));
    }
  });

  it("names the contract when an artifact has several", () => {
    const a = artifactJson();
    a.contracts.Other = clone(a.contracts.AbiVectors);
    const artifact = parseSilAbiArtifact(a);
    expect(() => getSilContract(artifact)).toThrow(expect.objectContaining({ code: "SILVER_CONTRACT_AMBIGUOUS" }));
    expect(getSilContract(artifact, "Other").name).toBe("Other");
    expect(() => getSilContract(artifact, "Nope")).toThrow(expect.objectContaining({ code: "SILVER_CONTRACT_NOT_FOUND" }));
  });
});

describe("serializeSilArtifactValues", () => {
  it("writes silverscript-abi {kind, value} JSON, exact for i64", () => {
    const json = serializeSilArtifactValues([
      { kind: "int", value: 2n ** 63n - 1n },
      { kind: "int", value: -5 },
      { kind: "bool", value: true },
      { kind: "byte", value: 255 },
      { kind: "bytes", value: new Uint8Array([0, 1]) },
      { kind: "text", value: "hé" },
      { kind: "array", value: [{ kind: "int", value: 1 }] },
      { kind: "object", value: { b: { kind: "bool", value: false }, a: { kind: "int", value: 2 } } }
    ]);
    expect(json).toBe(
      '[{"kind":"int","value":9223372036854775807},{"kind":"int","value":-5},{"kind":"bool","value":true},' +
        '{"kind":"byte","value":255},{"kind":"bytes","value":[0,1]},{"kind":"text","value":"hé"},' +
        '{"kind":"array","value":[{"kind":"int","value":1}]},' +
        '{"kind":"object","value":{"a":{"kind":"int","value":2},"b":{"kind":"bool","value":false}}}]'
    );
    expect(read("abi-vectors.constructor-args.json").toString("utf8")).toBe(serializeSilArtifactValues([OWNER]));
  });

  it("refuses values that would not reach silverc intact", () => {
    const bad: SilArtifactValue[][] = [
      [{ kind: "int", value: 2 ** 60 }],
      [{ kind: "int", value: 2n ** 63n }],
      [{ kind: "byte", value: 256 }],
      [{ kind: "bytes", value: [1, 300] }],
      [{ kind: "nope" } as any]
    ];
    for (const values of bad) {
      expect(() => serializeSilArtifactValues(values)).toThrow(expect.objectContaining({ code: "SILVER_VALUE_INVALID" }));
    }
  });
});

describe("managed silverc", () => {
  let emptyHome: string;
  beforeAll(async () => {
    emptyHome = await fsp.mkdtemp(path.join(os.tmpdir(), "hardkas-silverc-home-"));
  });
  afterAll(async () => {
    await fsp.rm(emptyHome, { recursive: true, force: true });
  });

  it("is never taken from PATH: without a managed install there is no compiler", async () => {
    expect(() => resolveManagedSilverc(emptyHome)).toThrow(expect.objectContaining({ code: "SILVERC_TOOLCHAIN_NOT_INSTALLED" }));
    await expect(compileSilverScript({ source: "contract X() {}", home: emptyHome })).rejects.toMatchObject({
      code: "SILVERC_TOOLCHAIN_NOT_INSTALLED"
    });
  });

  it("refuses a managed install that does not match the pin", async () => {
    const ref = getSilvercReference();
    const dir = getToolchainInstallDir(ref, emptyHome);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, ref.entry), "not silverc");
    expect(() => resolveManagedSilverc(emptyHome)).toThrow(expect.objectContaining({ code: "SILVERC_TOOLCHAIN_INTEGRITY_FAILED" }));
  });

  it("compiles deterministically and records provenance by digest", async () => {
    const source = read("abi-vectors.sil");
    const result = await compileSilverScript({ source, constructorArgs: [OWNER] });
    const vectors = JSON.parse(read("abi-vectors.vectors.json").toString("utf8"));

    // Same source, arguments and pinned compiler => the fixture's exact bytes.
    expect(Buffer.from(result.artifactBytes)).toEqual(read("abi-vectors.artifact.json"));
    expect(result.provenance.artifactSha256).toBe(vectors.generator.artifactSha256);

    const ref = getSilvercReference();
    expect(result.provenance).toEqual({
      schema: SILVER_COMPILE_PROVENANCE_SCHEMA,
      compiler: {
        id: "silverc",
        repository: SILVERSCRIPT_RELEASE.repository,
        releaseTag: "v1.0.0",
        commit: SILVERSCRIPT_RELEASE.commit,
        assetName: ref.assetName,
        assetSha256: ref.assetSha256,
        binarySha256: ref.files[ref.entry]!.sha256,
        languageVersion: "0.1.0"
      },
      sourceSha256: sha(source),
      constructorArgsSha256: sha(serializeSilArtifactValues([OWNER])),
      artifactSha256: sha(result.artifactBytes),
      abiSchemaVersion: 1,
      contracts: [
        {
          name: "AbiVectors",
          bytecodeSha256: sha(Buffer.from(result.artifact.contracts.AbiVectors!.compiled.bytecode)),
          templateHash: Buffer.from(result.artifact.contracts.AbiVectors!.compiled.template_hash).toString("hex"),
          entries: expect.arrayContaining([{ name: "keys", dispatchTag: "949a1e6f" }])
        }
      ]
    });
    // Constructor arguments appear only as a digest.
    expect(JSON.stringify(result.provenance)).not.toContain("[7,7,7");
  });

  it("surfaces compiler errors instead of substituting a script", async () => {
    const legacy = fs.readFileSync(path.join(FIXTURES, "abi-vectors.sil"), "utf8").replace(/\bentry (\w+)\(/g, "entrypoint function $1(");
    await expect(compileSilverScript({ source: legacy, constructorArgs: [OWNER] })).rejects.toMatchObject({
      code: "SILVERC_COMPILE_FAILED"
    });
    await expect(compileSilverScript({ source: read("abi-vectors.sil") })).rejects.toThrow(/constructor argument count mismatch/);
    await expect(
      compileSilverScript({ source: read("abi-vectors.sil"), constructorArgs: [{ kind: "int", value: 5 }] })
    ).rejects.toThrow(/cannot convert artifact int to pubkey/);
  });
});
