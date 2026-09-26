import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";
import { resolveArtifactHandle, type LookupNamespace } from "@hardkas/artifacts";
import { nextStepsAfterSend, sendExplanation } from "../src/runners/next-steps.js";
import { describeWhyNode } from "../src/runners/why-narrative.js";
import { cliSemantics } from "../../../apps/docs/docs-data/cli-semantics.js";

// Wave 1.2 · CLI-NEXTSTEPS-1 / IC-5′.11: every suggestion the CLI prints after `tx send`
// resolves in the same workspace; `artifactId` is always the canonical identity and the
// txId is labelled as a txId. N9: the generated CLI reference (its data source) documents
// exactly the identifiers the resolver accepts. AUD-45: `why` narrates real fields.

/** Parses `hardkas <cmd> [--ns value | target] [--workspace x]` into what the resolver would receive. */
function parseSuggestion(cmd: string): { command: string; target: string; namespace?: LookupNamespace } {
  const parts = cmd.split(/\s+/);
  expect(parts[0]).toBe("hardkas");
  const command = parts[1]!;
  const rest = parts.slice(2).filter((p, i, all) => !(p === "--workspace" || all[i - 1] === "--workspace"));
  const flagIndex = rest.findIndex((p) => ["--artifact", "--plan", "--signed", "--tx", "--workflow"].includes(p));
  if (flagIndex >= 0) {
    return { command, target: rest[flagIndex + 1]!, namespace: rest[flagIndex]!.slice(2) as LookupNamespace };
  }
  return { command, target: rest[0]! };
}

describe("Wave 1.2 · CLI identifiers", () => {
  let ws: string;
  let sent: any;
  let plan: any;
  let signed: any;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w12-cli-"));
    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    signed = await sdk.tx.sign(plan, "alice");
    sent = await sdk.tx.send(signed, { persist: true });
  });

  afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("T-NS1 · every suggestion printed after tx send resolves in the same workspace", async () => {
    const steps = nextStepsAfterSend({ receipt: sent.receipt, txId: sent.txId, workspace: ws });
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      const { command, target, namespace } = parseSuggestion(step);
      expect(["explain", "why"]).toContain(command);
      const handle = await resolveArtifactHandle(target, ws, namespace ? { namespace } : undefined);
      expect(handle.artifactId, step).toBe(sent.receipt.contentHash);
    }
  });

  it("send explanation labels the canonical identity as artifactId and the txId as txId", () => {
    const explanation = sendExplanation({ receipt: sent.receipt, txId: sent.txId });
    expect(explanation).toEqual({ available: true, artifactId: sent.receipt.contentHash, txId: sent.txId });
    expect(explanation.artifactId).not.toBe(sent.txId);
  });

  it("T-N9 · the CLI reference data documents exactly the identifiers explain/why accept", () => {
    for (const cmd of ["hardkas explain", "hardkas why"]) {
      const accepted = cliSemantics[cmd]?.acceptedIdentifiers ?? [];
      expect(accepted, cmd).toEqual([
        "explicit filepath",
        "exact canonical artifactId",
        "--plan <planId>",
        "--signed <signedId>",
        "--tx <txId>",
        "--workflow <workflowId>"
      ]);
      expect(accepted.join(" ")).not.toMatch(/legacy compatibility/);
    }
    expect((cliSemantics["hardkas tx send"]?.limitations ?? []).join(" ")).not.toMatch(/CLI-NEXTSTEPS-1/);
  });

  it("T-A45 · why narrates real fields: plan outputs, receipt block observation, signed signers", () => {
    expect(describeWhyNode(plan)).toBe(`Transfers to ${plan.outputs.length} outputs`);
    expect(describeWhyNode(sent.receipt)).toBe("Block not observed (simulated execution)");
    expect(describeWhyNode({ ...sent.receipt, mode: "rpc", dagContext: { acceptingBlockHash: "ab".repeat(32) } })).toBe(`Included in block ${"ab".repeat(32)}`);
    expect(describeWhyNode({ ...sent.receipt, mode: "rpc" })).toBe("Block not observed");
  });
});
