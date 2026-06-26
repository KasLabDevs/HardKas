const fs = require('fs');

const publicApi = `# PUBLIC API SURFACE (0.10.x FREEZE)

The following APIs and commands are officially FROZEN and stable for the 0.10.x lifecycle. Breaking changes to these will require a major version bump.

## SDK & Runtime
- \`hk\` (Global HardKAS object)
- \`scenario()\` (Testing engine primitive)
- Artifact schema and registry APIs (\`@hardkas/artifacts\`)
- Tx building and lifecycles (\`@hardkas/tx-builder\`, \`tx\` commands)
- Accounts and Keystore APIs (\`@hardkas/accounts\`)
- Localnet and Query integrations (\`@hardkas/localnet\`, \`@hardkas/query\`)
- Plugin Interface V1 (Core lifecycle hooks and task definitions)

## CLI Commands
- \`hardkas init\`
- \`hardkas create\`
- \`hardkas test\`
- \`hardkas evidence\`
- \`hardkas task\`
`;

const experimental = `# EXPERIMENTAL SURFACE (0.10.x)

The following APIs and commands are marked as **EXPERIMENTAL**. They are included in the build but are explicitly exempt from the API Freeze. They may change structure, behavior, or be removed entirely without a major version bump.

## SDK & CLI
- \`zk\` (Local fixture verification)
- \`vprogs\` (Inspect-only)
- \`silver\` (SilverScript integration, DEGRADED_LOCAL)
- \`l2\` (Igra RPC/Signer stubs)
- \`bridge-local\` (Trustless exit simulation)
- Advanced Plugin Hooks (Low-level V2 hooks)
`;

const deprecated = `# DEPRECATED SURFACE (0.10.x)

The following APIs are deprecated in 0.9.x and will be removed completely in 1.0.

- Legacy dynamic boundary resolution in Query Store.
- Legacy plaintext keys in Keystore (must use encrypted \`keystoreRef\`).
- \`UI.maturity("internal")\` (replaced by explicit experimental/beta tags).
`;

const migration = `# MIGRATION GUIDE: 0.9.x to 0.10.x

## Key Changes
1. **Strict Evidence**: Tests must now be run with \`hardkas test --evidence\` to properly produce verifiable \`.hke.json\` packages.
2. **Keystore Security**: Plaintext keys are no longer permitted. Update your tests to use the newly enforced \`keystoreRef\` encryption.
3. **Template Scaffolding**: Use \`hardkas create <template>\` to get the latest 0.10.x V1 Plugin standard.

## Breaking Changes
- **Dynamic Boundaries**: Removed from Query Store. If you relied on them, migrate to the statically typed bounds.
`;

const freezeDoc = `# API FREEZE 0.10

This document serves as the official declaration of the API Freeze for HardKAS 0.10.x.

All core primitives (hk, scenario), CLI foundations (init, test, task), and the plugin interface V1 are now frozen. Any changes to these interfaces require strict RFC processes.

STATUS: **API_FREEZE_0_10_READY**
`;

fs.writeFileSync('PUBLIC_API_SURFACE.md', publicApi);
fs.writeFileSync('EXPERIMENTAL_SURFACE.md', experimental);
fs.writeFileSync('DEPRECATED_SURFACE.md', deprecated);
fs.writeFileSync('MIGRATION_GUIDE_0_9_TO_0_10.md', migration);
fs.writeFileSync('API_FREEZE_0_10.md', freezeDoc);

console.log('P24 API Freeze files generated.');

const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (!pkg.scripts['api:check']) {
  pkg.scripts['api:check'] = 'node scripts/api-check.mjs';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\\n');
  console.log('Added api:check to package.json');
}

fs.writeFileSync('scripts/api-check.mjs', `import fs from "node:fs";
import path from "node:path";
import url from "node:url";

console.log("=== API Check ===");
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const requiredFiles = [
  "PUBLIC_API_SURFACE.md",
  "EXPERIMENTAL_SURFACE.md",
  "DEPRECATED_SURFACE.md",
  "MIGRATION_GUIDE_0_9_TO_0_10.md",
  "API_FREEZE_0_10.md"
];

let allGood = true;
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(repoRoot, file))) {
    console.error("Missing " + file);
    allGood = false;
  }
}

if (!allGood) {
  process.exit(1);
}
console.log("API check passed. Surfaces are documented.");
`);
console.log('Created scripts/api-check.mjs');
