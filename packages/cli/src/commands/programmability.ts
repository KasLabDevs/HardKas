import { Command } from "commander";
import { getOutput } from "../output.js";

type ProgramKind = "silver" | "zk" | "vprog" | "full-lab";

export function registerProgrammabilityCommands(program: Command) {
  const programmability = program
    .command("programmability")
    .description("Builder-ready local programmability surface (Outputs JSON by default)");

  programmability
    .command("capabilities")
    .description("Show local programmability capabilities")
    .option("--json", "Output as JSON", false)
    .action(async () => {
      const sdk = await createSdk();
      const result = await sdk.programmability.capabilities();
      getOutput().writeJson({ ok: true, command: "programmability capabilities", mode: "cli", result });
    });

  programmability
    .command("audit")
    .description("Audit the boundaries and claims of programmability layers")
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
    .description("Inspect a Silver, ZK, or vProgs artifact")
    .requiredOption("--kind <kind>", "Artifact kind: silver, zk, or vprog")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string, options) => {
      const sdk = await createSdk();
      const kind = normalizeInspectKind(options.kind);
      const result = await sdk.programmability.inspect({ kind, path: targetPath });
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
    .description("Verify a local programmability artifact")
    .requiredOption("--kind <kind>", "Artifact kind: silver, zk, or vprog")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string, options) => {
      const sdk = await createSdk();
      const kind = normalizeInspectKind(options.kind);
      const result = await sdk.programmability.verify({ kind, path: targetPath });
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
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string) => {
      const sdk = await createSdk();
      const result = await sdk.programmability.corpus.verify({ path: targetPath });
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
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      const sdk = await createSdk();
      const kind = normalizeKind(options.kind, true) as ProgramKind;
      const result = sdk.programmability.app.plan({ kind, template: options.template });
      getOutput().writeJson({ ok: true, command: "programmability app plan", mode: "cli", result });
    });
}

async function createSdk() {
  const { Hardkas } = await import("@hardkas/sdk");
  return Hardkas.create({
    cwd: process.cwd(),
    network: "simulated",
    autoBootstrap: true
  });
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
