// SA-2 test harness (SECURITY-AUDIT-1, 2026-10-21): starts the dashboard the way this release exposes it — through the
// PUBLIC API `@hardkas/cli/public` (`runDashboard`); the `hardkas dashboard` command is not registered in the CLI. The
// process stays alive while the server listens; the test kills it.
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { runDashboard } = await import(pathToFileURL(path.resolve(here, "../../dist/public.js")).href);
await runDashboard();
