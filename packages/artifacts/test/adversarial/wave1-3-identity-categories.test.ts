import { describe, it, expect } from "vitest";
import * as schemas from "../../src/schemas.js";
import * as artifacts from "../../src/index.js";

// Wave 1.3 · Closure Pack IC-7.1: every identifier field of every schema declares
// its category in a registry, checked by introspection. IC-7.2: CONTENT is the only
// category that may be used as an artifact identity or reference.

const IDENTIFIER_KEY = /(Id|Hash|Ids|Hashes)$|^id$|^txId$|^path$|Path$|Paths$|^digest$|Digest$/;

/** Walks a Zod object schema and yields dotted paths of every key (arrays descend into their element). */
function* keysOf(schema: any, prefix = "", seen = new Set<any>()): Generator<string> {
  const def = schema?._def;
  if (!def) return;
  const type = def.typeName;
  if (type === "ZodObject") {
    const shape = typeof def.shape === "function" ? def.shape() : def.shape;
    for (const [key, child] of Object.entries(shape)) {
      const p = prefix ? `${prefix}.${key}` : key;
      yield p;
      yield* keysOf(child, p, seen);
    }
  } else if (type === "ZodArray") {
    yield* keysOf(def.type, `${prefix}[]`, seen);
  } else if (type === "ZodOptional" || type === "ZodNullable" || type === "ZodDefault") {
    yield* keysOf(def.innerType, prefix, seen);
  } else if (type === "ZodUnion") {
    for (const opt of def.options) yield* keysOf(opt, prefix, seen);
  } else if (type === "ZodRecord") {
    yield* keysOf(def.valueType, `${prefix}.*`, seen);
  } else if (type === "ZodEffects") {
    yield* keysOf(def.schema, prefix, seen);
  } else if (type === "ZodLazy") {
    if (seen.has(def)) return;
    seen.add(def);
    yield* keysOf(def.getter(), prefix, seen);
  }
}

describe("Wave 1.3 · IC-7.1 identity categories registry", () => {
  const api = artifacts as any;

  it("exports the registry and the closed category set", () => {
    expect(api.IDENTITY_CATEGORIES).toBeDefined();
    expect(Array.isArray(api.IDENTITY_CATEGORY_NAMES)).toBe(true);
    expect([...api.IDENTITY_CATEGORY_NAMES].sort()).toEqual(
      ["CONTENT", "CORRELATION", "DOMAIN_DIGEST", "LABEL", "LOCATOR", "NETWORK", "SYNTHETIC_NETWORK"].sort()
    );
    expect(typeof api.identityCategoryOf).toBe("function");
  });

  it("every identifier-shaped field declared by an exported Zod schema is registered", () => {
    const missing = new Set<string>();
    for (const [name, value] of Object.entries(schemas)) {
      if (!(value as any)?._def) continue;
      for (const p of keysOf(value)) {
        const leaf = p.split(".").pop()!.replace(/\[\]$/, "");
        if (!IDENTIFIER_KEY.test(leaf)) continue;
        if (api.identityCategoryOf(leaf) === undefined) missing.add(`${name}: ${p}`);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });

  it("IC-7.2: only CONTENT names are identities or references; labels, network ids and correlation ids are not", () => {
    expect(api.identityCategoryOf("artifactId")).toBe("CONTENT");
    expect(api.identityCategoryOf("contentHash")).toBe("CONTENT");
    expect(api.identityCategoryOf("parentArtifactId")).toBe("CONTENT");
    expect(api.identityCategoryOf("rootArtifactId")).toBe("CONTENT");
    expect(api.identityCategoryOf("planId")).toBe("LABEL");
    expect(api.identityCategoryOf("signedId")).toBe("LABEL");
    expect(api.identityCategoryOf("txId")).toBe("NETWORK");
    expect(api.identityCategoryOf("covenantId")).toBe("NETWORK");
    expect(api.identityCategoryOf("workflowId")).toBe("CORRELATION");
    expect(api.identityCategoryOf("executionId")).toBe("CORRELATION");
    expect(api.identityCategoryOf("eventId")).toBe("CORRELATION");
    expect(api.identityCategoryOf("stateHash")).toBe("DOMAIN_DIGEST");
    expect(api.identityCategoryOf("artifactSha256")).toBe("DOMAIN_DIGEST");
    expect(api.identityCategoryOf("unsignedPayloadHash")).toBe("DOMAIN_DIGEST");
    expect(api.identityCategoryOf("tracePath")).toBe("LOCATOR");
    expect(api.identityCategoryOf("path")).toBe("LOCATOR");
    expect(api.isIdentityCategory("CONTENT")).toBe(true);
    expect(api.isIdentityCategory("LABEL")).toBe(false);
    expect(api.isIdentityCategory("NETWORK")).toBe(false);
    expect(api.isIdentityCategory("SYNTHETIC_NETWORK")).toBe(false);
    expect(api.isIdentityCategory("CORRELATION")).toBe(false);
    expect(api.isIdentityCategory("DOMAIN_DIGEST")).toBe(false);
    expect(api.isIdentityCategory("LOCATOR")).toBe(false);
  });

  it("the registry is closed: unknown names have no category", () => {
    expect(api.identityCategoryOf("somethingId")).toBeUndefined();
  });
});
