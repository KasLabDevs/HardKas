import { Command } from "commander";
import { getOutput } from "../output.js";
import { HardkasCliError } from "../cli-errors.js";

export function registerEnvCommands(program: Command) {
  const envCmd = program
    .command("env")
    .description("Manage and validate environment configurations");

  envCmd
    .command("check")
    .description("Validate the .env file against known HardKAS production variables")
    .action(async () => {
      const out = getOutput();
      out.writeLine("Checking environment variables...");

      let envContent = "";
      try {
        const { readFileSync } = await import("fs");
        const { join } = await import("path");
        envContent = readFileSync(join(process.cwd(), ".env"), "utf8");
      } catch (e) {
        // No .env file, we will just rely on process.env
      }

      // Parse basic key=value from envContent
      const parsedEnv: Record<string, string> = {};
      envContent.split("\n").forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match && match[1]) {
           parsedEnv[match[1]] = match[2] || "";
        }
      });

      // Merge with process.env
      const mergedEnv = { ...process.env, ...parsedEnv };

      const requiredVars = ["NETWORK", "KASPAD_URL", "HARDKAS_DATA_DIR", "HARDKAS_KASPAD_IMAGE", "LOG_LEVEL"];
      const optionalVars = ["DATABASE_URL", "PROMETHEUS_PORT"];

      const missing: string[] = [];
      const present: string[] = [];

      for (const req of requiredVars) {
        if (!mergedEnv[req] || mergedEnv[req].trim() === "") {
          missing.push(req);
        } else {
          present.push(req);
        }
      }

      for (const opt of optionalVars) {
        if (mergedEnv[opt] && mergedEnv[opt].trim() !== "") {
          present.push(`${opt} (optional)`);
        }
      }

      if (missing.length > 0) {
        out.error(`Missing required environment variables:\n  - ${missing.join("\n  - ")}`);
        out.writeLine("Ensure you have a .env file configured properly for deployment.");
        throw new HardkasCliError("ENV_VALIDATION_FAILED", "Missing required environment variables", { exitCode: 1 });
      }

      out.writeLine(`Environment is valid! Found ${present.length} variables.`);
      present.forEach(p => out.writeLine(`  ✅ ${p}`));
    });
}
