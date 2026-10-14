// MG: the docs site carries the same --allow-mainnet-signing help text (its extractor is APPS-DOCS-CLI-EXTRACTOR-1).
import fs from "node:fs";
const OLD = "Mainnet signing stays refused in this release; the flag only lets synthetic --threshold entries through";
const NEW = "Mainnet signing stays refused in this release (MAINNET_SIGNING_DISABLED); the flag has no effect";
for (const p of [
  "C:/Users/jrodr/hkl1/mg/src/apps/docs/docs-data/cli-command-inventory.json",
  "C:/Users/jrodr/hkl1/mg/src/apps/docs/docs/reference/cli/tx.md"
]) {
  const s = fs.readFileSync(p, "utf8");
  const c = s.split(OLD).length - 1;
  if (c !== 1) {
    console.log(`ABORT ${p}: found ${c}`);
    process.exit(1);
  }
  fs.writeFileSync(p, s.split(OLD).join(NEW));
  console.log(`ok ${p}`);
}
