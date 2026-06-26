# Chapter 4: Artifacts and Evidence

HardKAS goes beyond simple test execution by packaging the deterministic outputs of a scenario into verifiable evidence packages (`.hke.json`).

```bash execute
hardkas init evidence-project
cd evidence-project
```

Let's write a scenario that generates an artifact:

```bash execute
cat << 'EOF' > evidence-project/tests/evidence.test.ts
import { describe, it } from "vitest";
import { Hardkas } from "@hardkas/sdk";

describe("Evidence Scenario", () => {
  it("should generate evidence", async () => {
    const hk = await Hardkas.open(".", { mode: "script", network: "simulated" });
    await hk.artifacts.write({
      type: "TaskResult",
      scenarioName: "Evidence Scenario",
      status: "PASSED",
      networkId: hk.network,
      mode: "script",
      artifactsGenerated: [],
      metadata: {},
      payload: { value: 42 }
    }, { fileName: "task-results/task1.json" });
  });
});
EOF
```

Run the tests with the `--evidence` flag to automatically bundle the outputs:

```bash execute
cd evidence-project
hardkas test --evidence
```

Once the test completes and generates an evidence package, you can verify it:

```bash execute
cd evidence-project
hardkas evidence verify payment_flow.hke.json
```
