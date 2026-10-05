import { describe, it, expect, vi } from "vitest";
import { createDevServer } from "../src/server.js";

// EVIDENCE-TRUST-1 (investigation, 2026-10-05) · BEFORE, dev server. The API accepts its session token as a query
// parameter (`?token=`, which an EventSource needs), and the access log (`hono/logger`, src/server.ts:80) prints every
// request URL with its query string — the session token included, accepted or not.

const logged = async (path: string) => {
  const lines: string[] = [];
  // installed before the server is created: `logger()` binds its print function (console.log) when it is built
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  let status: number;
  let token: string;
  try {
    const server = createDevServer({ port: 7420, host: "localhost", unsafeExternal: false });
    token = (server as any).token as string;
    const res = await server.app.request(path.replace("<token>", token), { headers: { host: "localhost:7420" } });
    status = res.status;
  } finally {
    spy.mockRestore();
  }
  return { token, lines, status };
};

describe("EVIDENCE-TRUST-1 · the dev server never prints its session token", () => {
  it("control: a request is written to the access log", async () => {
    const r = await logged("/api/health?token=<token>");
    expect(r.lines.some((l) => l.includes("/api/health")), r.lines.join(" | ")).toBe(true);
  });

  it("a request authenticated with ?token= does not print the token", async () => {
    const r = await logged("/api/health?token=<token>");
    expect(r.status, "precondition: the query token authenticates").toBe(200);
    const leaks = r.lines.filter((l) => l.includes(r.token)).map((l) => l.replace(r.token, `<${r.token.length}-char session token>`));
    expect(leaks, leaks.join(" | ")).toEqual([]);
  });

  it("a rejected ?token= value is not printed either", async () => {
    const r = await logged("/api/health?token=ET1WRONGTOKENVALUE");
    expect(r.status, "precondition: rejected").toBe(401);
    const leaks = r.lines.filter((l) => l.includes("ET1WRONGTOKENVALUE"));
    expect(leaks, leaks.join(" | ")).toEqual([]);
  });
});
