import { describe, it, expect } from "vitest";
import { exactValuesText } from "../src/commands/silver-dev-framework.js";
import { HardkasCliError } from "../src/cli-errors.js";

// -----------------------------------------------------------------------------
// F1 (N-1, N-7) · the constructor-argument pre-check of the dev-framework commands, before develop's {kind, value} parser:
// every number is judged by its literal at any depth and in any key order; a larger plain integer goes on as its exact
// digits; a fraction or an exponent is refused with its path; an int's string form must be decimal digits. Text that is
// not JSON goes on unchanged, for that parser to report as it always did. Canonical level, no process is started.
// -----------------------------------------------------------------------------

const refused = (text: string): HardkasCliError => {
  try {
    exactValuesText(text, "--constructor-args");
  } catch (e) {
    if (e instanceof HardkasCliError) return e;
    throw e;
  }
  throw new Error("not refused");
};

describe("F1 · exactValuesText", () => {
  it("N6 larger integers at any depth and in any key order become their exact digits", () => {
    const text =
      '[{"kind":"array","value":[{"value":9007199254740993,"kind":"int"},' +
      '{"kind":"object","value":{"a":{"kind":"int","note":1,"value":18446744073709551615}}}]},{"kind":"int","value":-9223372036854775807}]';
    const out = JSON.parse(exactValuesText(text, "--constructor-args"));
    expect(out[0].value[0].value).toBe("9007199254740993");
    expect(out[0].value[1].value.a.value).toBe("18446744073709551615");
    expect(out[0].value[1].value.a.note).toBe(1);
    expect(out[1].value).toBe("-9223372036854775807");
  });

  it("N7 a fraction or an exponent at depth is refused with its path and literal (SILVER_JSON_NUMBER_UNSAFE)", () => {
    const e = refused('[{"kind":"array","value":[{"kind":"int","value":1},{"value":1e3,"kind":"int"}]}]');
    expect(e.code).toBe("SILVER_JSON_NUMBER_UNSAFE");
    expect(e.message).toContain("--constructor-args[0].value[1].value");
    expect(e.message).toContain("1e3");
  });

  it("N8 safe integers, bytes and text are unchanged; text that is not JSON goes on as it is", () => {
    const text = '[{"kind":"int","value":-5},{"kind":"bytes","value":[1,2,255]},{"kind":"text","value":"1e3"}]';
    expect(JSON.parse(exactValuesText(text, "--constructor-args"))).toEqual(JSON.parse(text));
    expect(exactValuesText("not json [", "--constructor-args")).toBe("not json [");
  });

  it("N9 an int's string form must be decimal digits, at depth too (SILVER_JSON_INT_INVALID)", () => {
    for (const bad of ['"0x10"', '""', '" 10 "', '"5.0"', '"1e3"', '"+5"']) {
      const e = refused(`[{"kind":"array","value":[{"kind":"int","value":${bad}}]}]`);
      expect(e.code, bad).toBe("SILVER_JSON_INT_INVALID");
      expect(e.message, bad).toContain("--constructor-args[0].value[0].value");
    }
    expect(JSON.parse(exactValuesText('[{"kind":"int","value":"-0"},{"kind":"int","value":"9007199254740993"}]', "--constructor-args"))).toEqual([
      { kind: "int", value: "-0" },
      { kind: "int", value: "9007199254740993" }
    ]);
  });
});
