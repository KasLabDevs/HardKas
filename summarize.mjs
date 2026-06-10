import fs from "fs";
const data = JSON.parse(
  fs.readFileSync("console-audit.json", "utf16le").replace(/^\uFEFF/, "")
);

const summary = {
  sdk: [],
  core: [],
  artifacts: [],
  txBuilder: [],
  cliCommands: [],
  cliRunners: [],
  devServer: [],
  simulator: [],
  other: []
};

for (const d of data) {
  const p = d.Path.replace(/\\/g, "/");
  if (
    p.includes("/test/") ||
    p.includes("/tests/") ||
    p.includes(".test.ts") ||
    p.includes("/scripts/")
  )
    continue;
  if (p.includes("/packages/testing/")) continue;

  const entry = `${p.split("/packages/")[1]}:${d.LineNumber}`;

  if (p.includes("/packages/sdk/src/")) summary.sdk.push(entry);
  else if (p.includes("/packages/core/src/")) summary.core.push(entry);
  else if (p.includes("/packages/artifacts/src/")) summary.artifacts.push(entry);
  else if (p.includes("/packages/tx-builder/src/")) summary.txBuilder.push(entry);
  else if (p.includes("/packages/cli/src/commands/")) summary.cliCommands.push(entry);
  else if (p.includes("/packages/cli/src/runners/")) summary.cliRunners.push(entry);
  else if (p.includes("/packages/dev-server/src/")) summary.devServer.push(entry);
  else if (p.includes("/packages/simulator/src/")) summary.simulator.push(entry);
  else summary.other.push(entry);
}

console.log(JSON.stringify(summary, null, 2));
