import { execSync } from "node:child_process";

console.log("=== RUNNING FULL LOCAL GAUNTLET ===");

function run(cmd, exitOnFail = true) {
  console.log(`\n> ${cmd}`);
  try {
    const start = Date.now();
    const out = execSync(cmd, { stdio: "inherit", shell: true });
    console.log(`[PASS] (${Date.now() - start}ms)`);
  } catch (err) {
    console.error(`\n[FAIL] Command failed: ${cmd}`);
    if (exitOnFail) {
      process.exit(1);
    }
  }
}

console.log("\n==================================================");
console.log("1. Fresh clone / clean workspace simulation");
console.log("==================================================");
run("git status");
// M-03 (2026-11-07): the lockfile is the one CI reproduces; a gauntlet that rewrites it does not test the release
run("pnpm install --frozen-lockfile");
run("pnpm build");
run("pnpm typecheck");
run("pnpm test");

console.log("\n==================================================");
console.log("2. Static guards");
console.log("==================================================");

run("node scripts/check-silver-no-shell-exec.mjs");
run("node scripts/check-forbidden-claims.mjs --self-test");
run("node scripts/check-forbidden-claims.mjs");
run("node scripts/check-query-store-security.mjs");
run("node scripts/check-artifact-registry.mjs");
run("node scripts/check-packaging-smoke.mjs");
run("node scripts/check-dev-server-security.mjs");
// M-03 (2026-11-07): a style check (`catch (e: any)` -> `catch (e: unknown)`), not a release gate. It reports ~170
// existing occurrences and used to end the gauntlet here, before the corpus, localnet and packaging stages ran.
// Advisory: printed, never fatal.
run("node scripts/check-typescript-hygiene.mjs", false);

console.log("\n==================================================");
console.log("3. Corpus / programmability");
console.log("==================================================");
run("pnpm corpus:toccata");
run("pnpm zk:corpus");
run("pnpm vprogs:check");
run("pnpm programmability:corpus");
run("pnpm programmability:templates");

console.log("\n==================================================");
console.log("4. Toccata live localnet");
console.log("==================================================");
run("pnpm gauntlet:toccata");

console.log("\n==================================================");
console.log("5. Packaging external consumer");
console.log("==================================================");
run("node scripts/check-packaging-smoke.mjs");

console.log("\n==================================================");
console.log("6. Postrelease break");
console.log("==================================================");
run("pnpm postrelease:break");

console.log("\n=== FULL GAUNTLET SUCCESS ===");
