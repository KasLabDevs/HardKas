import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// -----------------------------------------------------------------------------
// P32: the docs import only what the packages export. `docs/reference/client.md` imported `HardkasProvider` from
// `@hardkas/client` (the provider is `HardKASProvider`, in `@hardkas/react`), `docs/start/installation.md` named it
// `HardkasProvider`, and `docs/guides/sdk-wallet.md` showed a `@hardkas/sdk/dist/...` deep import and read
// `receipt.txId` off `tx.simulate`, which returns `{ receipt }`. Every named `@hardkas/*` import in these pages must be
// a name the package's built declaration exports (canonical level: reads the docs and the built `dist/*.d.ts`).
// P43: the simulated ledger (`network: "simulated"`, @hardkas/localnet) is not @hardkas/simulator. The pages the
// surface audit cited no longer give the simulator's WrongMass rule to the ledger, call the quickstart's ledger "the
// in-memory simulator", say an approximate GHOSTDAG builds the CLI's DAG, or say the PSKT bridge lacks the v1 fields.
// -----------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const P32_PAGES = ["docs/reference/client.md", "docs/start/installation.md", "docs/guides/sdk-wallet.md", "docs/concepts/correct-vs-incorrect-flows.md"];

/** Names a package's built declaration for `subpath` exports (`export { a, type B, c as d }` and `export declare ...`). */
function exportedNames(pkg: string, subpath: string): Set<string> {
  const manifest = JSON.parse(read(`packages/${pkg}/package.json`));
  const entry = manifest.exports?.[subpath];
  const types = typeof entry === "object" ? entry.types : subpath === "." ? manifest.types : undefined;
  expect(types, `${pkg} ${subpath} declares types`).toBeTypeOf("string");
  const dts = read(path.join("packages", pkg, types));
  const names = new Set<string>();
  for (const m of dts.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()!.trim();
      if (name) names.add(name);
    }
  }
  for (const m of dts.matchAll(/export\s+(?:declare\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]!);
  return names;
}

function namedImports(md: string): Array<{ names: string[]; spec: string }> {
  const out: Array<{ names: string[]; spec: string }> = [];
  for (const m of md.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](@hardkas\/[^"']+)["']/g)) {
    out.push({ names: m[1]!.split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim()).filter(Boolean), spec: m[2]! });
  }
  return out;
}

describe("P32 · docs import only what the packages export", () => {
  for (const page of P32_PAGES) {
    it(`${page}: every named @hardkas/* import is exported by its package`, () => {
      const md = read(page);
      for (const { names, spec } of namedImports(md)) {
        const [, pkg, sub] = /^@hardkas\/([^/]+)(?:\/(.+))?$/.exec(spec)!;
        const exported = exportedNames(pkg!, sub ? `./${sub}` : ".");
        for (const n of names) expect(exported.has(n), `${page}: ${n} from ${spec}`).toBe(true);
      }
    });
  }

  it("no page names the provider HardkasProvider or imports from a dist/ path", () => {
    for (const page of P32_PAGES) {
      const md = read(page);
      expect(md, page).not.toMatch(/\bHardkasProvider\b/);
      expect(md, page).not.toMatch(/from\s*["']@hardkas\/[^"']+\/dist\//);
      expect(md, page).not.toMatch(/@hardkas\/sdk\/dist\//);
    }
  });

  it("client.md imports something from each package it documents, and the provider from @hardkas/react", () => {
    const imports = namedImports(read("docs/reference/client.md"));
    expect(imports).toContainEqual({ names: ["createClient"], spec: "@hardkas/client" });
    expect(imports).toContainEqual({ names: ["HardKASProvider"], spec: "@hardkas/react" });
  });

  it("tx.simulate is read as { receipt } where the pages call it", () => {
    for (const page of ["docs/guides/sdk-wallet.md", "docs/concepts/correct-vs-incorrect-flows.md"]) {
      const md = read(page);
      expect(md, page).toMatch(/const \{ receipt \} = await sdk\.tx\.simulate\(/);
      expect(md, page).not.toMatch(/const receipt = await sdk\.tx\.simulate\(/);
    }
  });
});

describe("P43 · the simulated ledger is not the simulator in the cited pages", () => {
  it("what-works.md: the network: \"simulated\" row is the ledger; WrongMass belongs to @hardkas/simulator", () => {
    const row = read("docs/start/what-works.md").split(/\r?\n/).find((l) => l.includes('`network: "simulated"`'))!;
    expect(row).toMatch(/^\| The simulated ledger/);
    expect(row).toMatch(/@hardkas\/localnet/);
    expect(row).toMatch(/It is not `@hardkas\/simulator`.*`WrongMass`/);
  });

  it("build-on-simnet.md: the quickstart runs on the simulated ledger, not 'the in-memory simulator'", () => {
    const md = read("docs/start/build-on-simnet.md");
    expect(md).not.toMatch(/in-memory simulator/);
    expect(md).toMatch(/simulated ledger \(`network: "simulated"`/);
  });

  it("limitations.md: the PSKT bridge carries the v1 covenant fields; it lacks a compute budget", () => {
    const md = read("docs/status/limitations.md");
    expect(md).not.toMatch(/does not know the transaction-v1 fields/);
    expect(md).toMatch(/already carries the\s+transaction-v1 covenant fields/);
  });

  it("site/index.html: the DAG section does not claim an approximate GHOSTDAG builds the CLI's DAG", () => {
    const html = read("site/index.html");
    const section = html.slice(html.indexOf('<section id="dag">'), html.indexOf("</section>", html.indexOf('<section id="dag">')));
    expect(section).not.toMatch(/approximate GHOSTDAG/);
    expect(section).not.toMatch(/simulator DAG/);
    expect(section).toMatch(/No GHOSTDAG runs on this path/);
  });
});
