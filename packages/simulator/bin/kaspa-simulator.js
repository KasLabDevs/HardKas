#!/usr/bin/env node
import { runCli } from "../dist/cli/index.js";

runCli().catch((err) => {
  console.error("Fatal simulator error:", err);
  process.exit(1);
});
