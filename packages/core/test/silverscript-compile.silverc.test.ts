import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SILVERSCRIPT_RELEASE,
  SILVER_COMPILE_PROVENANCE_SCHEMA,
  compileSilverScript,
  getSilvercReference,
  serializeSilArtifactValues,
  type SilArtifactValue
} from "../src/index.js";

// silverc level (AUD-41): these cases invoke the pinned compiler installed in
// HARDKAS_HOME. The compiler-less contract (no PATH fallback, integrity of a
// managed install) stays in silverscript.test.ts at the unit level.
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "silverscript-v1");
const read = (name: string) => fs.readFileSync(path.join(FIXTURES, name));
const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const OWNER: SilArtifactValue = { kind: "bytes", value: Array.from({ length: 32 }, () => 7) };

describe("managed silverc (pinned compiler installed)", () => {
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
