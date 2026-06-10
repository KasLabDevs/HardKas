import { spawnSync } from "node:child_process";

const pnpmCommand = process.env.npm_execpath
  ? [process.execPath, [process.env.npm_execpath]]
  : ["pnpm", []];
const commands = [
  [
    pnpmCommand[0],
    [
      ...pnpmCommand[1],
      "exec",
      "tsx",
      "packages/cli/src/index.ts",
      "vprogs",
      "status",
      "--json"
    ]
  ],
  [
    pnpmCommand[0],
    [
      ...pnpmCommand[1],
      "exec",
      "tsx",
      "packages/cli/src/index.ts",
      "vprogs",
      "inspect",
      "fixtures/toccata-v2/vprogs/inspect-only-artifact.json",
      "--json"
    ]
  ]
];

for (const [cmd, args] of commands) {
  const result = spawnSync(cmd, args, {
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32" && !process.env.npm_execpath
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
