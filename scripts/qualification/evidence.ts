import fs from "fs/promises";
import path from "path";
import { ExecutionContext, GateResult } from "../types.js";

export async function writeEvidenceBundle(ctx: ExecutionContext, gate: GateResult): Promise<void> {
  const gateDir = path.join(ctx.options.reportDir, ctx.manifest.runId, "failures", gate.id);
  await fs.mkdir(gateDir, { recursive: true });

  const summary = `
# Failure: Gate ${gate.id} - ${gate.name}

Status: ${gate.status}
Started At: ${gate.startedAt}
Ended At: ${gate.endedAt}

## Assertions
${gate.assertions.map(a => `- [${a.passed ? "x" : " "}] ${a.name}${a.error ? `\n  Error: ${a.error}` : ""}${a.actual ? `\n  Actual: ${JSON.stringify(a.actual)}` : ""}`).join("\n")}

## Error
${gate.error || "None"}
`;

  await fs.writeFile(path.join(gateDir, "summary.md"), summary, "utf-8");

  if (gate.evidence && gate.evidence.length > 0) {
    for (let i = 0; i < gate.evidence.length; i++) {
      await fs.writeFile(path.join(gateDir, `evidence-${i}.txt`), gate.evidence[i], "utf-8");
    }
  }
}
