import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSignedTxArtifact, readTxPlanArtifact } from "../src/io.js";

// INT9 · consumer rehearsal finding: `tx send` of a signed artifact whose contentHash does not match was refused
// (nothing sent) but with the code UNKNOWN_ERROR, while `artifact verify` of the same file says ARTIFACT_HASH_MISMATCH.
// The typed readers now carry the code of the verification issue that failed them; the message is unchanged.

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "valid");
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hardkas-int9-typed-read-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function copyFixture(name: string, mutate?: (a: any) => void): string {
  const artifact = JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));
  mutate?.(artifact);
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(artifact, null, 2));
  return file;
}

describe("INT9 · typed artifact readers carry the failing issue's code", () => {
  it("a valid signed artifact still reads", async () => {
    const signed = await readSignedTxArtifact(copyFixture("signed-tx.valid.json"));
    expect(signed.contentHash).toBe("519f16276b9a332bdb309705fc8deac7704e3ebb1eb2c784d88c3f8ef4994661");
  });

  it("a tampered signed artifact: ARTIFACT_HASH_MISMATCH, message unchanged", async () => {
    const file = copyFixture("signed-tx.valid.json", (a) => {
      a.amountSompi = "1000000001";
    });
    const err: any = await readSignedTxArtifact(file).then(
      () => undefined,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/^Invalid SignedTx artifact: /);
    expect(err.code).toBe("ARTIFACT_HASH_MISMATCH");
  });

  it("a tampered plan: ARTIFACT_HASH_MISMATCH too", async () => {
    const file = copyFixture("tx-plan.valid.json", (a) => {
      a.amountSompi = String(BigInt(a.amountSompi ?? "1") + 1n);
    });
    const err: any = await readTxPlanArtifact(file).then(
      () => undefined,
      (e: unknown) => e
    );
    expect(err?.message).toMatch(/^Invalid TxPlan artifact: /);
    expect(err?.code).toBe("ARTIFACT_HASH_MISMATCH");
  });
});
