// DASHBOARD-CLOSE-1 test harness: starts the dashboard through the PUBLIC API `@hardkas/cli/public` (`runDashboard`) and
// closes it with what the call returned. Nothing else keeps this process alive: once the server is closed it ends by
// itself (a dashboard that cannot be closed keeps it running, and the test stops it).
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { runDashboard } = await import(pathToFileURL(path.resolve(here, "../../dist/public.js")).href);
const handle = await runDashboard();
console.log(JSON.stringify({ started: true, closable: typeof handle?.close === "function", url: handle?.url ?? null }));
if (typeof handle?.close === "function") {
  await handle.close();
  console.log(JSON.stringify({ closed: true }));
}
