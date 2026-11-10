import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSilAbiArtifact, parseSilArtifactValuesJson, prepareSilverVmTests } from "../src/index.js";

/*
 * SC-09 · `silver test` limited the JSON numbers of a test file (nested argument values, scenario amounts, sequences,
 * lock times) to ±(2^53 − 1): a u64/i64 beyond that could not be written at all (refused, never rounded). They now go to
 * the runner exactly: an exact JSON integer (a JSON.rawJSON value, as `hardkas silver test` reads the file, or a bigint
 * from a programmatic caller) between i64::MIN and u64::MAX is written with its own digits; a JS number that is not a
 * safe integer is still refused (it already lost its digits), and so is anything outside that range or not an integer.
 */

const CORPUS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures", "toccata-v2", "silver");
const signed = {
  artifact: parseSilAbiArtifact(JSON.parse(fs.readFileSync(path.join(CORPUS, "p2sh-signed-release", "contract.artifact.json"), "utf8"))),
  constructorArgs: parseSilArtifactValuesJson(fs.readFileSync(path.join(CORPUS, "p2sh-signed-release", "contract.constructor-args.json"), "utf8"))
};
const KEY = createHash("sha256").update("hardkas-silver-runner-sc09").digest("hex");
const signer = () => KEY;
const raw = (digits: string): unknown => (JSON as any).rawJSON(digits);
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return e.code as string;
  }
  return "NO_ERROR";
};

const U64_MAX = "18446744073709551615";
const I64_MIN = "-9223372036854775808";
const BIG_AMOUNT = "2900000000000000000"; // MAX_SOMPI, far above 2^53

describe("SC-09 · exact u64/i64 numbers in a `silver test` file", () => {
  it("nested argument values and scenario numbers beyond 2^53 reach the runner file with their exact digits (rawJSON or bigint)", async () => {
    for (const exact of [raw, (d: string) => BigInt(d)]) {
      const p = await prepareSilverVmTests({
        ...signed,
        signer,
        tests: {
          tests: [
            {
              name: "big",
              function: "release",
              args: [[exact(U64_MAX), exact(I64_MIN)], { amount: exact(BIG_AMOUNT) }],
              expect: "fail",
              tx: {
                version: 0,
                lock_time: exact("9007199254740993"),
                inputs: [{ utxo_value: exact(BIG_AMOUNT), sequence: exact(U64_MAX), sig_op_count: 1 }],
                outputs: [{ value: exact("2899999999999999999"), script_hex: `20${"11".repeat(32)}ac` }]
              }
            }
          ]
        }
      });
      const text = p.runnerTestFile;
      expect(text).toContain(`[\n          ${U64_MAX},\n          ${I64_MIN}\n        ]`);
      expect(text).toContain(`"amount": ${BIG_AMOUNT}`);
      expect(text).toContain(`"lock_time": 9007199254740993`);
      expect(text).toContain(`"utxo_value": ${BIG_AMOUNT}`);
      expect(text).toContain(`"sequence": ${U64_MAX}`);
      expect(text).toContain(`"value": 2899999999999999999`);
    }
  });

  it("a signed scenario with exact large amounts is signed (the scenario reads them exactly; it threw a TypeError)", async () => {
    const p = await prepareSilverVmTests({
      ...signed,
      signer,
      tests: {
        tests: [
          {
            name: "owner",
            function: "release",
            args: [{ signature: "alice" }],
            expect: "pass",
            tx: { version: 0, inputs: [{ utxo_value: raw(BIG_AMOUNT), sig_op_count: 1 }], outputs: [{ value: raw("2899999999990000000"), script_hex: `20${"11".repeat(32)}ac` }] }
          }
        ]
      }
    });
    const t = JSON.parse(p.runnerTestFile).tests[0];
    expect(t.args[0]).toMatch(/^0x[0-9a-f]{130}$/);
    expect(p.runnerTestFile).toContain(`"utxo_value": ${BIG_AMOUNT}`);
  });

  it("still refused: a JS number past 2^53, a value outside i64::MIN..u64::MAX, a non-integer exact literal", async () => {
    const t = (inputs: unknown[]) => ({ tests: [{ name: "t", function: "release", args: [], expect: "pass", tx: { version: 0, inputs, outputs: [] } }] });
    expect(await code(prepareSilverVmTests({ ...signed, tests: t([{ utxo_value: 2 ** 53 + 2 }]) }))).toBe("SILVER_TEST_NUMBER_UNSAFE");
    expect(await code(prepareSilverVmTests({ ...signed, tests: t([{ utxo_value: raw("18446744073709551616") }]) }))).toBe("SILVER_TEST_NUMBER_UNSAFE");
    expect(await code(prepareSilverVmTests({ ...signed, tests: t([{ utxo_value: 2n ** 64n }]) }))).toBe("SILVER_TEST_NUMBER_UNSAFE");
    expect(await code(prepareSilverVmTests({ ...signed, tests: t([{ utxo_value: raw("-9223372036854775809") }]) }))).toBe("SILVER_TEST_NUMBER_UNSAFE");
    expect(await code(prepareSilverVmTests({ ...signed, tests: t([{ utxo_value: raw("1.5") }]) }))).toBe("SILVER_TEST_NUMBER_UNSAFE");
    expect(await code(prepareSilverVmTests({ ...signed, tests: t([{ utxo_value: raw("1e3") }]) }))).toBe("SILVER_TEST_NUMBER_UNSAFE");
  });
});
