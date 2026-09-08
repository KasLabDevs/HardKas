# Chapter 3: Your First Scenario

HardKAS brings scenario-driven testing via a custom Vitest integration.
You can write test scenarios that verify Kaspa logic.

Let's initialize a project and write a simple test:

```bash execute
hardkas init test-project
cd test-project
```

We can create a test scenario using `cat << 'EOF'`:

```bash execute
cat << 'EOF' > test-project/tests/hello.test.ts
import { describe, it, expect } from "vitest";

describe("First Scenario", () => {
  it("should run successfully", () => {
    expect(true).toBe(true);
  });
});
EOF
```

Now run the test!

```bash execute
cd test-project
hardkas test
```
