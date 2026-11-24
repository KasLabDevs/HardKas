import { describe, it, expect } from "vitest";
import { parseKasToSompi } from "@hardkas/core";
import { parseBatchFileJson } from "../src/runners/tx-batch-runner.js";

// BETA-FIX (ISSUE-ONCHAIN-JSON-PRECISION-1, last route): a `tx batch` file's "amount" written as a JSON number went through
// JSON.parse's double, then `amount.toString()`: past ~15-17 significant digits the KAS amount sent was not the file's.

describe("BETA-FIX · tx batch reads a numeric amount by its literal", () => {
  it("a long plain decimal keeps its digits (the double rounded it)", () => {
    const text = '{"payments":[{"from":"alice","to":"bob","amount":12345678901.12345678}]}';
    const viaDouble = String((JSON.parse(text) as any).payments[0].amount);
    expect(viaDouble).not.toBe("12345678901.12345678"); // the defect: the double is not the file's number
    const parsed: any = parseBatchFileJson(text);
    expect(parsed.payments[0].amount).toBe("12345678901.12345678");
    expect(parseKasToSompi(String(parsed.payments[0].amount))).toBe(1234567890112345678n);
  });

  it("the array form, a BOM, small amounts and string amounts are read as before", () => {
    const parsed: any = parseBatchFileJson('﻿[{"from":"a","to":"b","amount":10},{"from":"a","to":"c","amount":"2.5"},{"from":"a","to":"d","amount":0.1}]');
    expect(parsed.map((p: any) => String(p.amount))).toEqual(["10", "2.5", "0.1"]);
  });

  it("an exponent keeps the number (as before); only the 'amount' key is touched", () => {
    const parsed: any = parseBatchFileJson('{"payments":[{"from":"a","to":"b","amount":1e3,"note":12345678901.12345678}]}');
    expect(parsed.payments[0].amount).toBe(1000);
    expect(typeof parsed.payments[0].note).toBe("number");
  });
});
