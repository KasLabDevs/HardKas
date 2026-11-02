import { describe, it, expect } from "vitest";
import { parseSilArtifactValuesJson, serializeSilArtifactValues } from "../src/index.js";

// -----------------------------------------------------------------------------
// ISSUE-ONCHAIN-JSON-PRECISION-1 / N-1 / N-7 · parseSilArtifactValuesJson reads every int from its own literal, whatever
// the key order and the size, and refuses what BigInt() used to read some other way. It used to read an int exactly only
// when "kind" came right before "value": {"value":9007199254740993,"kind":"int"} became …992, "0x10" became 16, "" 0.
// Canonical level.
// -----------------------------------------------------------------------------

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e: any) {
    return e?.code;
  }
};

describe("ISSUE-ONCHAIN-JSON-PRECISION-1 · {kind, value} JSON keeps every int exact", () => {
  it("an int is exact in any key order and at any size, as a number or as a digit string", () => {
    const [a, b, c, d, e] = parseSilArtifactValuesJson(
      '[{"value":9007199254740993,"kind":"int"},{"kind":"int","value":9007199254740993},{"kind":"int","value":"9007199254740993"},{"kind":"int","note":0,"value":-9223372036854775808},{"value":0,"kind":"int"}]'
    );
    expect([a, b, c].map((v) => v!.value)).toEqual([9007199254740993n, 9007199254740993n, 9007199254740993n]);
    expect(d!.value).toBe(-9223372036854775808n);
    expect(e!.value).toBe(0n);
  });

  it("nested arrays and objects keep their ints exact; bytes and bytes stay numbers; the canonical form round-trips", () => {
    const text = '[{"kind":"array","value":[{"value":9007199254740993,"kind":"int"}]},{"kind":"object","value":{"n":{"value":18014398509481985,"kind":"int"},"b":{"kind":"byte","value":7}}},{"kind":"bytes","value":[0,1,255]}]';
    const values = parseSilArtifactValuesJson(text);
    expect((values[0] as any).value[0].value).toBe(9007199254740993n);
    expect((values[1] as any).value.n.value).toBe(18014398509481985n);
    expect((values[1] as any).value.b).toEqual({ kind: "byte", value: 7 });
    expect(values[2]).toEqual({ kind: "bytes", value: [0, 1, 255] });
    const canonical = serializeSilArtifactValues(values);
    expect(canonical).toContain('"value":9007199254740993');
    expect(serializeSilArtifactValues(parseSilArtifactValuesJson(canonical))).toBe(canonical);
  });

  it("an int that is not decimal digits is refused (SILVER_VALUE_INVALID), never read some other way", () => {
    for (const v of ['"0x10"', '""', '" 10 "', '"+5"', '"01"', '"5.0"', "1e3", "5.0", "1.0000000000000001", "4.9999999999999999e3", "-0.0", "true", "null"]) {
      expect(code(() => parseSilArtifactValuesJson(`[{"kind":"int","value":${v}}]`)), v).toBe("SILVER_VALUE_INVALID");
      expect(code(() => parseSilArtifactValuesJson(`[{"value":${v},"kind":"int"}]`)), `${v} (value first)`).toBe("SILVER_VALUE_INVALID");
    }
  });

  it("what is not a list of values is still SILVER_VALUE_INVALID (not JSON, not a list, an unknown kind)", () => {
    expect(code(() => parseSilArtifactValuesJson("not json"))).toBe("SILVER_VALUE_INVALID");
    expect(code(() => parseSilArtifactValuesJson('{"kind":"int","value":1}'))).toBe("SILVER_VALUE_INVALID");
    expect(code(() => parseSilArtifactValuesJson('[{"kind":"float","value":1}]'))).toBe("SILVER_VALUE_INVALID");
  });
});
