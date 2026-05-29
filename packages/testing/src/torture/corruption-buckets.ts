// SAFETY_LEVEL: SIMULATION_ONLY

import fs from "node:fs";
import path from "node:path";
import {
  registerTortureBucket,
  TortureBucketContext,
  TortureInvariantError
} from "./torture-engine.js";
import { AppendCoordinator } from "@hardkas/core";

registerTortureBucket({
  name: "concurrent-append-tail-repair",
  profiles: ["corruption"],
  expectedInvariant:
    "AppendCoordinator successfully truncates partial JSONL suffix while keeping large JSONL lines during concurrent append simulation",
  run: async (ctx: TortureBucketContext) => {
    const runDir = path.join(ctx.workspaceDir, ".tmp", `corruption-${ctx.caseId}`);
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });

    const eventsPath = path.join(runDir, "events.jsonl");

    // 1. Write a massive valid JSONL line > 64KB
    const largePayload = {
      schema: "hardkas.artifact.v1",
      type: "large",
      data: "x".repeat(70000)
    };
    fs.writeFileSync(eventsPath, JSON.stringify(largePayload) + "\n");
    const validSize = fs.statSync(eventsPath).size;

    // 2. Inject partial JSONL tail (corruption)
    // hardkas-append-allow
    fs.appendFileSync(
      eventsPath,
      '{"schema":"hardkas.artifact.v1","type":"corrupted","d'
    );

    // 3. Simulate "concurrent append during tail repair" by calling AppendCoordinator
    // It should detect the partial tail, truncate it, preserve the 70KB line, and append the new one.
    const newArtifact = { schema: "hardkas.artifact.v1", type: "recovery-test" };
    AppendCoordinator.appendAtomic(eventsPath, JSON.stringify(newArtifact), runDir);

    const content = fs.readFileSync(eventsPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);

    if (lines.length !== 2) {
      throw new TortureInvariantError(
        `Expected exactly 2 lines after recovery, got ${lines.length}`,
        "CORRUPTION_RECOVERY_FAILED",
        "catastrophic"
      );
    }

    try {
      JSON.parse(lines[0]!);
      JSON.parse(lines[1]!);
    } catch (e: any) {
      throw new TortureInvariantError(
        "Recovered JSON lines are invalid",
        "CORRUPTION_RECOVERY_JSON_PARSE",
        "catastrophic"
      );
    }

    if (lines[0]!.length < 70000) {
      throw new TortureInvariantError(
        "Large JSONL line was incorrectly truncated",
        "LARGE_LINE_TRUNCATED",
        "catastrophic"
      );
    }

    // Cleanup
    fs.rmSync(runDir, { recursive: true, force: true });

    return {
      flow: "concurrent-append-tail-repair",
      mutation: "massive valid line + partial tail + atomic append",
      environmentMode: "corruption",
      externalMutationDetected: true
    };
  }
});
