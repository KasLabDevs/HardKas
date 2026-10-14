// MG: the docs site's copy of `accounts consolidate --allow-mainnet` (its extractor is APPS-DOCS-CLI-EXTRACTOR-1).
import fs from "node:fs";
const NEW = "No effect: executing on mainnet stays refused in this release (MAINNET_BROADCAST_DISABLED)";
const plans = [
  ["C:/Users/jrodr/hkl1/mg/src/apps/docs/docs/reference/cli/accounts.md", "- `--allow-mainnet`: Allow consolidation on mainnet", "- `--allow-mainnet`: " + NEW],
  ["C:/Users/jrodr/hkl1/mg/src/apps/docs/docs-data/cli-command-inventory.json", null, null]
];
for (const [p, from, to] of plans) {
  let s = fs.readFileSync(p, "utf8");
  if (from === null) {
    // the inventory: the description that follows the "--allow-mainnet" flags entry
    const re = /("flags": "--allow-mainnet",\s*\r?\n\s*"description": )"Allow consolidation on mainnet"/;
    if (!re.test(s)) {
      console.log(`ABORT ${p}: inventory entry not found`);
      process.exit(1);
    }
    s = s.replace(re, `$1${JSON.stringify(NEW)}`);
  } else {
    const c = s.split(from).length - 1;
    if (c !== 1) {
      console.log(`ABORT ${p}: found ${c}`);
      process.exit(1);
    }
    s = s.split(from).join(to);
  }
  fs.writeFileSync(p, s);
  console.log(`ok ${p}`);
}
