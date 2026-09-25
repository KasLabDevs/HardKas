import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectArtifactStore } from "../src/store.js";
import { writeArtifact } from "../src/io.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";

/**
 * Regression: writeArtifact() built the file name from identifiers taken from
 * artifact content, so an artifactId such as `x/../../../../escaped` wrote the
 * file outside `.hardkas/artifacts`. readArtifact() compared paths by string
 * prefix, which also admitted sibling directories (`ws-evil` for `ws`).
 */
describe("ProjectArtifactStore: path safety", () => {
  let baseDir: string;
  let workspace: string;
  let store: ProjectArtifactStore;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-store-safety-"));
    workspace = path.join(baseDir, "ws");
    await fs.mkdir(workspace, { recursive: true });
    store = new ProjectArtifactStore(workspace);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("refuses an artifactId that names a path and writes nothing", async () => {
    await expect(
      store.writeArtifact({ schema: "hardkas.txReceipt", artifactId: "x/../../../../escaped" })
    ).rejects.toMatchObject({ code: "ARTIFACT_ID_INVALID" });

    expect(existsSync(path.join(workspace, "escaped.json"))).toBe(false);
    expect(existsSync(path.join(baseDir, "escaped.json"))).toBe(false);
  });

  it("names the offending field", async () => {
    await expect(
      store.writeArtifact({ schema: "hardkas.txReceipt", txId: "subdir/tx" })
    ).rejects.toThrow(/Invalid txId/);
    await expect(
      store.writeArtifact({ schema: "hardkas.txReceipt", planId: "..\\..\\evil" })
    ).rejects.toThrow(/Invalid planId/);
  });

  it("refuses non-string identifiers", async () => {
    await expect(
      store.writeArtifact({ schema: "hardkas.txPlan", artifactId: { toString: () => "../x" } })
    ).rejects.toMatchObject({ code: "ARTIFACT_ID_INVALID" });
  });

  // Wave 1.1 · N3: the store refuses artifacts without a declared hashVersion or whose
  // body no longer hashes to the declared contentHash, so writable fixtures are sealed.
  const sealed = (body: Record<string, unknown>) => {
    const artifact: Record<string, unknown> = { ...body, hashVersion: CURRENT_HASH_VERSION };
    artifact.contentHash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
    return artifact as Record<string, unknown> & { contentHash: string };
  };

  it("does not let the schema choose a directory", async () => {
    const artifact = sealed({ schema: "hardkas.sub/dir.v1" });
    const written = await store.writeArtifact(artifact);
    expect(path.dirname(written)).toBe(path.join(workspace, ".hardkas", "artifacts", "misc"));
    expect(path.basename(written)).toBe(`artifact-${artifact.contentHash}.json`);
  });

  it("still writes ordinary identifiers into the canonical subdirectory", async () => {
    const written = await store.writeArtifact(
      sealed({
        schema: "hardkas.txReceipt",
        txId: "6a32bce2df64daa0a52e1d4f5875b5b9efc741fedd2ea9881d6c4492452d1816"
      })
    );
    expect(path.dirname(written)).toBe(path.join(workspace, ".hardkas", "artifacts", "receipts"));
  });

  it("reports traversal on read even when the target does not exist", async () => {
    const outside = path.join(baseDir, "missing.json");
    await expect(store.readArtifact(outside)).rejects.toMatchObject({ code: "PATH_TRAVERSAL" });
  });

  it("refuses to read an existing file outside the workspace", async () => {
    const outside = path.join(baseDir, "secret.json");
    await fs.writeFile(outside, JSON.stringify({ secret: "data" }));
    await expect(store.readArtifact(outside)).rejects.toMatchObject({ code: "PATH_TRAVERSAL" });
  });

  it("refuses a sibling directory that shares the workspace prefix", async () => {
    const sibling = path.join(baseDir, "ws-evil");
    await fs.mkdir(sibling, { recursive: true });
    const file = path.join(sibling, "artifact.json");
    await fs.writeFile(file, JSON.stringify({ schema: "hardkas.txPlan" }));
    await expect(store.readArtifact(file)).rejects.toMatchObject({ code: "PATH_TRAVERSAL" });
  });

  it("writeArtifact() into a directory refuses identifiers that name a path", async () => {
    const outDir = path.join(workspace, "out") + path.sep;
    await expect(
      writeArtifact(outDir, { schema: "hardkas.txPlan", planId: "../../escaped" })
    ).rejects.toMatchObject({ code: "ARTIFACT_ID_INVALID" });
    expect(existsSync(path.join(baseDir, "txPlan-escaped.json"))).toBe(false);
    expect(existsSync(path.join(workspace, "txPlan-escaped.json"))).toBe(false);
  });

  it("reads a file inside the workspace by path", async () => {
    const file = path.join(workspace, "my-receipt.json");
    // Wave 1.2 · IC-5′.4: a path read is verified too, so the fixture is sealed.
    await fs.writeFile(file, JSON.stringify(sealed({ schema: "hardkas.txReceipt", txId: "abc" })));
    await expect(store.readArtifact(file)).resolves.toMatchObject({ txId: "abc" });
  });
});
