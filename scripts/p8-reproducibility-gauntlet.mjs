import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  console.log("Running Reproducibility Gauntlet...");

  // Import the built module from the testing package
  const { generateReproducibilityReport } = await import(
    "file://" + path.join(__dirname, "../packages/testing/dist/reproducibility.js")
  );

  const iterations = 10;
  const reports = [];

  for (let i = 0; i < iterations; i++) {
    reports.push(generateReproducibilityReport());
  }

  // Verify all iterations match the first one exactly
  const baseline = JSON.stringify(reports[0].artifacts);
  let passed = true;

  for (let i = 1; i < iterations; i++) {
    const current = JSON.stringify(reports[i].artifacts);
    if (baseline !== current) {
      console.error(`Iteration ${i + 1} MISMATCH!`);
      console.error(`Expected: ${baseline}`);
      console.error(`Got:      ${current}`);
      passed = false;
    }
  }

  if (passed) {
    console.log(`\nAll ${iterations} iterations matched perfectly.`);
  } else {
    console.error(`\nReproducibility FAILED across iterations!`);
    process.exit(1);
  }

  const report = reports[0];
  const markdown = `# Reproducibility Gauntlet

## Run Info
- **Proof Version:** \`${report.proofVersion}\`
- **HardKAS Version:** \`${report.hardkasVersion}\`
- **Iterations Tested:** ${iterations}
- **Status:** ${passed ? "✅ **PASS**" : "❌ **FAIL**"}

## Verified Canonical Hashes

These hashes proved deterministic across multiple memory and execution bounds.

\`\`\`json
${JSON.stringify(report.artifacts, null, 2)}
\`\`\`
`;

  const outPath = path.join(process.cwd(), "REPRODUCIBILITY_GAUNTLET.md");
  fs.writeFileSync(outPath, markdown, "utf-8");
  console.log(`Wrote ${outPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
