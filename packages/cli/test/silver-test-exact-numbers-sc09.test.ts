import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readExactTestsJson } from "../src/commands/silver-dev-framework.js";

// -----------------------------------------------------------------------------
// SC-09 · `hardkas silver test --tests` read the test file by B-2's rule, which refuses any JSON integer past 2^53 - 1,
// so a u64/i64 amount, sequence or nested argument value beyond that could not be written at all (refused, never
// rounded). The --tests reader now keeps such an integer exactly (a JSON.rawJSON value the runner file carries with its
// own digits); a fraction or an exponent is still refused. Canonical level: the reader runs before any runner.
// -----------------------------------------------------------------------------

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e: any) {
    return e?.code;
  }
};

describe("SC-09 · the `silver test --tests` reader keeps u64/i64 integers exact", () => {
  it("integers past 2^53 (u64::MAX, i64::MIN, MAX_SOMPI) are kept with their digits, at the top level of a field and nested", () => {
    const text =
      '{"tests":[{"name":"t","function":"f","expect":"pass","args":[[18446744073709551615,-9223372036854775808],{"amount":2900000000000000000}],' +
      '"tx":{"inputs":[{"utxo_value":9007199254740993,"sequence":18446744073709551615}],"outputs":[{"value":1000}]}}]}';
    const parsed = readExactTestsJson(text, "--tests") as any;
    expect(JSON.stringify(parsed)).toBe(text);
    expect(parsed.tests[0].tx.outputs[0].value).toBe(1000); // a safe integer stays a plain number
  });

  it("a fraction or an exponent is still refused (SILVER_JSON_NUMBER_UNSAFE), whatever its value", () => {
    for (const lit of ["1e3", "1.0000000000000001", "0.0", "1E+20"]) {
      expect(code(() => readExactTestsJson(`{"tests":[{"tx":{"inputs":[{"utxo_value":${lit}}]}}]}`, "--tests")), lit).toBe("SILVER_JSON_NUMBER_UNSAFE");
    }
  });

  it("silver test reads its --tests file with this reader", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../src/commands/silver.ts"), "utf8");
    const action = src.slice(src.indexOf('.command("test <record>")'), src.indexOf("prepareSilverVmTests", src.indexOf('.command("test <record>")')));
    expect(action).toMatch(/readExactTestsJson\(testsBytes\.toString\("utf8"\), "--tests"\)/);
  });
});
