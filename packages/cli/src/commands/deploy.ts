import { Command } from "commander";
import { UI } from "../ui.js";
import {
  trackDeployment,
  listAllDeployments,
  inspectDeployment,
  verifyDeploymentStatus,
  showDeploymentHistory
} from "../runners/deployment-runners.js";

export function registerDeployCommands(program: Command) {
  const deployCmd = program.command("deploy").description("Track and manage deployments");

  deployCmd
    .command("init")
    .description(`Generate deployment profiles (Docker Compose, Dockerfile, .env.example) ${UI.maturity("alpha")}`)
    .action(async () => {
      const { getOutput } = await import("../output.js");
      const out = getOutput();
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      
      const cwd = process.cwd();
      
      out.writeLine("Generating deployment artifacts...");

      const dockerCompose = `version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NETWORK=\${NETWORK:-testnet}
      - KASPAD_URL=\${KASPAD_URL}
      - HARDKAS_DATA_DIR=/app/data
      - HARDKAS_KASPAD_IMAGE=\${HARDKAS_KASPAD_IMAGE:-kaspanet/kaspad:latest}
      - LOG_LEVEL=\${LOG_LEVEL:-info}
      - DATABASE_URL=\${DATABASE_URL}
    volumes:
      - hardkas_data:/app/data

volumes:
  hardkas_data:
`;
      await fs.writeFile(path.join(cwd, "docker-compose.yml"), dockerCompose, "utf8");
      out.writeLine("  ✅ Created docker-compose.yml");

      const dockerfile = `FROM node:18-alpine
WORKDIR /app

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install

# Copy application source
COPY . .

# Build application if necessary
# RUN pnpm run build

ENV NODE_ENV=production
ENV HARDKAS_DATA_DIR=/app/data

EXPOSE 3000

CMD ["pnpm", "start"]
`;
      await fs.writeFile(path.join(cwd, "Dockerfile"), dockerfile, "utf8");
      out.writeLine("  ✅ Created Dockerfile");

      const envExample = `NETWORK=testnet
KASPAD_URL=127.0.0.1:16210
HARDKAS_DATA_DIR=./.hardkas
HARDKAS_KASPAD_IMAGE=kaspanet/kaspad:latest
LOG_LEVEL=info

# Optional
# DATABASE_URL=postgres://user:pass@localhost:5432/db
# PROMETHEUS_PORT=9090
`;
      await fs.writeFile(path.join(cwd, ".env.example"), envExample, "utf8");
      out.writeLine("  ✅ Created .env.example");

      const checklist = `# Production Deployment Checklist

## Environment
- [ ] Ensure \`.env\` is created based on \`.env.example\`.
- [ ] Run \`hardkas env check\` locally to validate variables.

## Security
- [ ] Do NOT commit \`.env\` or \`.hardkas/keystore\` to source control.
- [ ] Set appropriate restrictive permissions on the data directory.

## Observability
- [ ] Verify \`/health\` and \`/metrics\` endpoints are not publicly accessible if they contain sensitive data, or set up a reverse proxy.

## Data Persistence
- [ ] Ensure Docker volume \`hardkas_data\` is properly mapped and backed up.
- [ ] If using SQLite, ensure the database file resides within the persistent volume.
`;
      await fs.writeFile(path.join(cwd, "PRODUCTION_CHECKLIST.md"), checklist, "utf8");
      out.writeLine("  ✅ Created PRODUCTION_CHECKLIST.md");

      out.writeLine("\\nDeployment profile generated successfully!");
      out.writeLine("Review PRODUCTION_CHECKLIST.md before deploying.");
    });

  deployCmd
    .command("track <label>")
    .description(`Create a deployment record for a transaction ${UI.maturity("stable")}`)
    .requiredOption("--network <name>", "Network where deployed")
    .option("--tx-id <txId>", "Transaction ID")
    .option("--plan <artifactId>", "Reference to plan artifact")
    .option("--receipt <artifactId>", "Reference to receipt artifact")
    .option("--status <status>", "Deployment status", "sent")
    .option("--notes <text>", "Notes about this deployment")
    .option("--json", "Output as JSON", false)
    .action(async (label, opts) => {
      const { UI } = await import("../ui.js");
      await trackDeployment({ label, ...opts, workspaceRoot: process.cwd() });
    });

  deployCmd
    .command("list")
    .description(`List all tracked deployments ${UI.maturity("stable")}`)
    .option("--network <name>", "Filter by network")
    .option("--status <status>", "Filter by status")
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await listAllDeployments({ ...opts, workspaceRoot: process.cwd() });
    });

  deployCmd
    .command("inspect <label>")
    .description(`Show full details of a deployment ${UI.maturity("stable")}`)
    .requiredOption("--network <name>", "Network")
    .option("--json", "Output as JSON", false)
    .action(async (label, opts) => {
      await inspectDeployment({ label, ...opts, workspaceRoot: process.cwd() });
    });

  deployCmd
    .command("status <label>")
    .description(
      `Check deployment status (query RPC if available) ${UI.maturity("stable")}`
    )
    .requiredOption("--network <name>", "Network")
    .option("--verify", "Verify against RPC node", false)
    .option("--json", "Output as JSON", false)
    .action(async (label, opts) => {
      await verifyDeploymentStatus({ label, ...opts, workspaceRoot: process.cwd() });
    });

  deployCmd
    .command("history")
    .description(`Show deployment history across all networks ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await showDeploymentHistory({ ...opts, workspaceRoot: process.cwd() });
    });
}
