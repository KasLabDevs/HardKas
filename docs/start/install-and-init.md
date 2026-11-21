# Chapter 2: Install and Init

To start a new project with HardKAS, you use the `init` command. In the current directory it scaffolds `hardkas.config.ts`, a `package.json` (when none exists), `vitest.config.ts`, `.gitignore`, `test/payment.test.ts` and the `.hardkas/` workspace with five funded simulated accounts.

These chapters use a global `hardkas` ([Installing the CLI globally](./installation.md#installing-the-cli-globally)); with a per-project install, prefix each command with `npx`. Create a folder for the project and run every command of the chapter from inside it:

```bash
mkdir my-project
cd my-project
```

```bash execute
hardkas init
```

(`hardkas init my-project` does the same in a new `my-project` folder.) Once the project is initialized, you can inspect the configuration it wrote:

```bash execute
hardkas config show
```

Then install the dependencies the generated `package.json` declares (the SDK, the CLI, `@hardkas/testing` and Vitest) and run the generated test:

```bash
npm install
npm test
```
