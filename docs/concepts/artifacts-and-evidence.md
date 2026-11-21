# Chapter 4: Artifacts and Evidence

HardKAS goes beyond simple test execution by packaging the deterministic outputs of a scenario into verifiable evidence packages (`.hke.json`).

Create a project folder, initialize it, and run every command of the chapter from inside it:

```bash
mkdir evidence-project
cd evidence-project
```

```bash execute
hardkas init
```

Install the dependencies the generated `package.json` declares (Vitest and `@hardkas/testing` among them):

```bash
npm install
```

`init` already wrote a scenario that generates artifacts: `test/payment.test.ts`, named `payment flow`. It funds `alice` on the simulated ledger, then plans, signs and sends 10 KAS to `bob`; the artifacts it writes are listed in its scenario result.

Run the tests with the `--evidence` flag to bundle each scenario's result and artifacts into a package named after the scenario:

```bash execute
hardkas test --evidence
```

Once the test completes and generates an evidence package, you can verify it:

```bash execute
hardkas evidence verify payment_flow.hke.json
```

The package is evidence of a simulated run: no node and no consensus were involved.
