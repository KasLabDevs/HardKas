import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";
import { KeystoreManager } from "@hardkas/accounts";
import { calculateContentHash, CURRENT_HASH_VERSION, createScenarioResultArtifact, scenarioModeForNetwork } from "@hardkas/artifacts";

vi.setConfig({ testTimeout: 60_000 });

// CONTAINMENT-2 (R1) · names that become path components are decided before anything is read or written:
//   - `artifacts.write(a, { outputDir, fileName })` writes ONLY directly inside `outputDir` (the file name may come from
//     artifact content: the replay report is named after `receipt.txId`, a field of an unsigned artifact);
//   - a replay receipt that declares a txId which is not a transaction id is an invalid input (D2: refused, never
//     replaced by another identity), so nothing runs and no report is written;
//   - `workspace.keystorePath(name)` is ONE plain file of the workspace's keystore directory, which honours a
//     configured hardkasDir (D3).

const tempParent = () => fs.mkdtempSync(path.join(os.tmpdir(), "hk-containment-2-sdk-"));

/** Every entry under `dir` (directories marked with a trailing '/'), relative and sorted. */
const entriesUnder = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p).split(path.sep).join("/");
      if (e.isDirectory()) {
        out.push(`${rel}/`);
        walk(p);
      } else out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
};

describe("CONTAINMENT-2 · artifacts.write stays inside its outputDir", () => {
  it("a fileName that climbs out of outputDir is refused before anything is created; a plain one is written inside", async () => {
    const parent = tempParent();
    try {
      const ws = path.join(parent, "ws");
      fs.mkdirSync(ws);
      const sdk = await Hardkas.open({ cwd: ws, network: "simulated", autoBootstrap: true });
      try {
        const artifact = createScenarioResultArtifact({
          scenarioName: "containment-2",
          status: "passed",
          networkId: "simulated",
          mode: scenarioModeForNetwork("simulated")
        });
        const outputDir = path.join(ws, "out");
        const refused = await sdk.artifacts.write(artifact as any, { outputDir, fileName: "../escaped.json" }).then(
          () => null,
          (e: any) => e?.code ?? String(e)
        );
        // nothing outside, and nothing partially inside: not even the output directory
        const afterRefusal = { escaped: fs.existsSync(path.join(ws, "escaped.json")), outputDirCreated: fs.existsSync(outputDir) };
        const ok = await sdk.artifacts.write(artifact as any, { outputDir, fileName: "inside.json" });
        expect({
          refused,
          ...afterRefusal,
          inside: ok.absolutePath === path.join(outputDir, "inside.json") && fs.existsSync(path.join(outputDir, "inside.json"))
        }).toEqual({ refused: "ARTIFACT_FILE_NAME_INVALID", escaped: false, outputDirCreated: false, inside: true });
      } finally {
        await sdk.close();
      }
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});

/**
 * A real simulated execution (plan → authorization → receipt) in a fresh simulated workspace, plus, when `txId` is
 * given, a copy of its receipt that declares that txId instead, sealed under the current hash version so it still
 * passes integrity (the receipt schema types txId as any string). Returns the receipt to replay.
 */
async function simulatedReceipt(ws: string, txId?: string): Promise<string> {
  const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  try {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed = await sdk.tx.sign(plan, "alice");
    const { receipt, receiptPath } = (await sdk.tx.simulate(signed as any)) as any;
    if (txId === undefined) return receiptPath;
    const copy: any = { ...receipt, txId, hashVersion: CURRENT_HASH_VERSION };
    copy.contentHash = calculateContentHash(copy, CURRENT_HASH_VERSION);
    if (copy.lineage) copy.lineage = { ...copy.lineage, artifactId: copy.contentHash };
    const copyPath = path.join(path.dirname(receiptPath), `txReceipt-${copy.contentHash}.json`);
    fs.writeFileSync(copyPath, JSON.stringify(copy, null, 2));
    return copyPath;
  } finally {
    await sdk.close();
  }
}

describe("CONTAINMENT-2 · a replay receipt's txId must be a transaction id before it names a report (D2)", () => {
  it("an invalid txId is an invalid input: nothing runs, no report anywhere, nothing outside the workspace", async () => {
    for (const txId of ["../../../escaped", "not-a-transaction-id"]) {
      const parent = tempParent();
      try {
        const ws = path.join(parent, "ws");
        fs.mkdirSync(ws);
        const receiptPath = await simulatedReceipt(ws, txId);
        const before = entriesUnder(parent);
        const sdk = await Hardkas.open({ cwd: ws, network: "simulated" });
        let result: any;
        try {
          result = await sdk.replay.verify({ path: receiptPath });
        } finally {
          await sdk.close();
        }
        const created = entriesUnder(parent).filter((e) => !before.includes(e));
        expect({ txId, code: result.code, report: result.report, reports: created.filter((e) => e.endsWith(".replay.json")), outside: created.filter((e) => !e.startsWith("ws/")) }).toEqual({
          txId,
          code: "REPLAY_INPUT_INVALID",
          report: null,
          reports: [],
          outside: []
        });
      } finally {
        fs.rmSync(parent, { recursive: true, force: true });
      }
    }
  });

  it("control: the real receipt (a synthetic txId) is replayed and its report is written inside the store", async () => {
    const parent = tempParent();
    try {
      const ws = path.join(parent, "ws");
      fs.mkdirSync(ws);
      const receiptPath = await simulatedReceipt(ws);
      const before = entriesUnder(parent);
      const sdk = await Hardkas.open({ cwd: ws, network: "simulated" });
      try {
        const result = await sdk.replay.verify({ path: receiptPath });
        const reports = entriesUnder(parent).filter((e) => !before.includes(e) && e.endsWith(".replay.json"));
        expect({ code: result.code, reports: reports.map((r) => r.startsWith("ws/.hardkas/artifacts/")) }).toEqual({ code: undefined, reports: [true] });
      } finally {
        await sdk.close();
      }
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe("CONTAINMENT-2 · workspace.keystorePath (D3: the workspace's keystoreDir is the authority)", () => {
  it("default: <root>/.hardkas/keystore; with a configured hardkasDir the keystore goes there, and only there", async () => {
    const parent = tempParent();
    try {
      const ws = path.join(parent, "ws");
      const override = path.join(parent, "custom-hardkas");
      fs.mkdirSync(path.join(ws, ".hardkas"), { recursive: true });
      fs.mkdirSync(override);
      const byDefault = await Hardkas.open({ cwd: ws });
      const overridden = await Hardkas.open({ cwd: ws, hardkasDir: override });
      try {
        const paths = { byDefault: byDefault.workspace.keystorePath("alice"), overridden: overridden.workspace.keystorePath("alice") };
        expect(paths).toEqual({
          byDefault: path.join(ws, ".hardkas", "keystore", "alice.json"),
          overridden: path.join(override, "keystore", "alice.json")
        });
        const keystore = await KeystoreManager.createEncryptedKeystore(
          { address: "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw", privateKey: "11".repeat(32), network: "simnet" } as any,
          "containment-2-password",
          { label: "alice", network: "simnet" }
        );
        await KeystoreManager.saveEncryptedKeystore(paths.overridden, keystore);
        expect({ inOverride: fs.existsSync(paths.overridden), defaultKeystoreDir: fs.existsSync(path.join(ws, ".hardkas", "keystore")) }).toEqual({
          inOverride: true,
          defaultKeystoreDir: false
        });
      } finally {
        await byDefault.close();
        await overridden.close();
      }
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it("refuses a name that is not one plain keystore file, and an existing entry that is not a plain file", async () => {
    const parent = tempParent();
    try {
      const ws = path.join(parent, "ws");
      fs.mkdirSync(path.join(ws, ".hardkas", "keystore", "bob.json"), { recursive: true }); // a directory where a keystore would be
      const sdk = await Hardkas.open({ cwd: ws });
      try {
        const codeOf = (name: unknown) => {
          try {
            sdk.workspace.keystorePath(name);
            return null;
          } catch (e: any) {
            return e?.code ?? String(e);
          }
        };
        expect(["../x", path.join(parent, "x"), "CON", "nul", "a.b", "bob", 42].map(codeOf)).toEqual(Array(7).fill("ACCOUNT_NAME_INVALID"));
        expect(codeOf("alice")).toBeNull();
      } finally {
        await sdk.close();
      }
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});
