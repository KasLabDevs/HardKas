import { Command } from "commander";

type ProgramKind = "silver" | "zk" | "vprog" | "full-lab";

export function registerProgrammabilityCommands(program: Command) {
  const programmability = program
    .command("programmability")
    .description("Builder-ready local programmability surface");

  programmability
    .command("capabilities")
    .description("Show local programmability capabilities")
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      const sdk = await createSdk();
      printResult(await sdk.programmability.capabilities(), options.json);
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
      printResult(result, options.json);
      if (!result.ok) process.exitCode = 1;
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
      printResult(result, options.json);
      if (!result.ok && result.status !== "PROGRAMMABILITY_VERIFY_PARTIAL") process.exitCode = 1;
    });

  const corpus = programmability
    .command("corpus")
    .description("Verify local programmability corpora");

  corpus
    .command("verify <path>")
    .description("Verify the root Toccata programmability corpus")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string, options) => {
      const sdk = await createSdk();
      const result = await sdk.programmability.corpus.verify({ path: targetPath });
      printResult(result, options.json);
      if (!result.ok) process.exitCode = 1;
    });

  const app = programmability
    .command("app")
    .description("Plan builder app surfaces");

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
      printResult(result, options.json);
    });
}

async function createSdk() {
  const { Hardkas } = await import("@hardkas/sdk");
  return Hardkas.create({ cwd: process.cwd(), network: "simulated", autoBootstrap: true });
}

function normalizeInspectKind(kind: string): Exclude<ProgramKind, "full-lab"> {
  if (kind === "silver" || kind === "zk" || kind === "vprog") return kind;
  throw new Error(`PROGRAMMABILITY_KIND_INVALID: ${kind}`);
}

function normalizeKind(kind: string, allowFullLab: boolean): Exclude<ProgramKind, "full-lab"> | ProgramKind {
  if (kind === "silver" || kind === "zk" || kind === "vprog") return kind;
  if (allowFullLab && kind === "full-lab") return kind;
  throw new Error(`PROGRAMMABILITY_KIND_INVALID: ${kind}`);
}

function printResult(result: unknown, _json?: boolean) {
  console.log(JSON.stringify(result, null, 2));
}
