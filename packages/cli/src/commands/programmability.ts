import { Command } from "commander";
import type { HardkasProgrammability } from "@hardkas/sdk";
import { getOutput } from "../output.js";
import { withSdk } from "../runners/with-sdk.js";

type ProgramKind = "silver" | "zk" | "vprog" | "full-lab";

export function registerProgrammabilityCommands(program: Command) {
  const programmability = program
    .command("programmability")
    // L1-CORE-1 B4 (frozen area, help text only): it said "Builder-ready"; it is local inspection and fixture checks
    .description(
      "Experimental local programmability tools: inspection and fixture checks of Silver, ZK and vProgs artifacts; no vProgs runtime, no on-chain ZK verification (Outputs JSON by default)"
    );

  programmability
    .command("capabilities")
    .description("Show local programmability capabilities")
    .option("--json", "Output as JSON (always: this command only prints JSON; the flag changes nothing)", false)
    .action(async () => {
      const result = await withProgrammability((prog) => prog.capabilities());
      getOutput().writeJson({ ok: true, command: "programmability capabilities", mode: "cli", result });
    });

  programmability
    .command("audit")
    // L1-CORE-1 B4 (frozen area, help text only): "Audit" read like a check of something; it prints a fixed statement
    .description(
      "Print the fixed list of what this build's programmability layers do not do (on-chain ZK verification, vProgs runtime, L2 bridge and exit, real stable-asset issuer): a static statement that inspects and runs nothing"
    )
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      const output = getOutput();
      const auditResult = {
        zk: { onchainVerification: false },
        vprogs: { runtime: false },
        l2: { realBridge: false, trustlessExit: false },
        stableAssets: { realIssuer: false }
      };

      if (options.json) {
        output.writeJson({ ok: true, command: "programmability audit", mode: "cli", result: auditResult });
      } else {
        output.writeLine("Programmability Claims & Boundaries:");
        // Keep stringify for human mode only
        output.writeLine(JSON.stringify(auditResult, null, 2));
      }
    });

  programmability
    .command("inspect <path>")
    .description("Inspect a Silver, ZK, or vProgs artifact: its schema and content hash. It never establishes node evidence for the artifact (artifactEvidence.realNodeEvidence: NOT_ESTABLISHED); the product's claims are in 'programmability capabilities'")
    .requiredOption("--kind <kind>", "Artifact kind: silver, zk, or vprog")
    .option("--json", "Output as JSON (always: this command only prints JSON; the flag changes nothing)", false)
    .action(async (targetPath: string, options) => {
      const result = await withProgrammability((prog) => {
        const kind = normalizeInspectKind(options.kind);
        return prog.inspect({ kind, path: targetPath });
      });
      getOutput().writeJson({ ok: result.ok, command: "programmability inspect", mode: "cli", result });
      if (!result.ok) {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("PROGRAMMABILITY_INSPECT_FAILED", "Inspect failed", {
          exitCode: 1
        });
      }
    });

  programmability
    .command("verify <path>")
    .description("Verify a local programmability artifact's integrity. It never establishes node evidence for the artifact (artifactEvidence.realNodeEvidence: NOT_ESTABLISHED)")
    .requiredOption("--kind <kind>", "Artifact kind: silver, zk, or vprog")
    .option("--json", "Output as JSON (always: this command only prints JSON; the flag changes nothing)", false)
    .action(async (targetPath: string, options) => {
      const result = await withProgrammability((prog) => {
        const kind = normalizeInspectKind(options.kind);
        return prog.verify({ kind, path: targetPath });
      });
      getOutput().writeJson({ ok: result.ok, command: "programmability verify", mode: "cli", result });
      if (!result.ok && result.status !== "PROGRAMMABILITY_VERIFY_PARTIAL") {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("PROGRAMMABILITY_VERIFY_FAILED", "Verify failed", {
          exitCode: 1
        });
      }
    });

  const corpus = programmability
    .command("corpus")
    .description("Verify local programmability corpora");

  corpus
    .command("verify <path>")
    .description("Verify the root Toccata programmability corpus")
    .option("--json", "Output as JSON (always: this command only prints JSON; the flag changes nothing)", false)
    .action(async (targetPath: string) => {
      const result = await withProgrammability((prog) => prog.corpus.verify({ path: targetPath }));
      getOutput().writeJson({ ok: result.ok, command: "programmability corpus verify", mode: "cli", result });
      if (!result.ok) {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("CORPUS_VERIFY_FAILED", "Corpus verify failed", {
          exitCode: 1
        });
      }
    });

  const app = programmability.command("app").description("Plan builder app surfaces");

  app
    .command("plan")
    .description("Return a local app plan for a programmable HardKAS app")
    .option("--kind <kind>", "silver, zk, vprog, or full-lab", "full-lab")
    .option("--template <path>", "Template path")
    .option("--json", "Output as JSON (always: this command only prints JSON; the flag changes nothing)", false)
    .action(async (options) => {
      const result = await withProgrammability((prog) => {
        const kind = normalizeKind(options.kind, true) as ProgramKind;
        return prog.app.plan({ kind, template: options.template });
      });
      getOutput().writeJson({ ok: true, command: "programmability app plan", mode: "cli", result });
    });
}

/** RESOURCE-LIFECYCLE-1 (RL-I1): the SDK a command opens for its programmability call is released after it. */
async function withProgrammability<T>(use: (prog: HardkasProgrammability) => T | Promise<T>): Promise<T> {
  const { HardkasProgrammability } = await import("@hardkas/sdk");
  return withSdk({ cwd: process.cwd(), network: "simulated", autoBootstrap: true }, (sdk) => use(new HardkasProgrammability(sdk)));
}

function normalizeInspectKind(kind: string): Exclude<ProgramKind, "full-lab"> {
  if (kind === "silver" || kind === "zk" || kind === "vprog") return kind;
  throw new Error(`PROGRAMMABILITY_KIND_INVALID: ${kind}`);
}

function normalizeKind(
  kind: string,
  allowFullLab: boolean
): Exclude<ProgramKind, "full-lab"> | ProgramKind {
  if (kind === "silver" || kind === "zk" || kind === "vprog") return kind;
  if (allowFullLab && kind === "full-lab") return kind;
  throw new Error(`PROGRAMMABILITY_KIND_INVALID: ${kind}`);
}
