import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createLogger,
  createMetricRegistry,
  toPrometheusText,
  getHealthSnapshot,
  type LogEntry
} from "../src/index.js";

// PKG-1 (rc2 audit, area E): @hardkas/observability is published (a dependency of kaspa-rpc, jobs and toolkit) and had
// no test. These pin what it does: the logger's level filter and entry shape, the metric registry, the Prometheus text
// format and the health snapshot.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("@hardkas/observability · logger", () => {
  it("drops entries below its level and writes the others to its sink", () => {
    const seen: LogEntry[] = [];
    const log = createLogger({ level: "warn", sink: (e) => seen.push(e) });
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(seen.map((e) => [e.level, e.event])).toEqual([
      ["warn", "w"],
      ["error", "e"]
    ]);
    expect(Number.isNaN(Date.parse(seen[0]!.timestamp))).toBe(false);
  });

  it("merges base context, call context and component; leaves out an empty context", () => {
    const seen: LogEntry[] = [];
    const log = createLogger({ level: "trace", sink: (e) => seen.push(e) });
    log.info("plain");
    log.with({ a: 1 }).component("rpc").component("ws").info("ev", { b: 2 });
    expect(seen[0]).not.toHaveProperty("context");
    expect(seen[0]).not.toHaveProperty("component");
    expect(seen[1]).toMatchObject({ level: "info", event: "ev", component: "rpc:ws", context: { a: 1, b: 2 } });
  });

  it("keeps its level in derived loggers", () => {
    const seen: LogEntry[] = [];
    const child = createLogger({ level: "error", sink: (e) => seen.push(e) }).with({ x: 1 }).component("c");
    child.warn("dropped");
    child.error("kept");
    expect(seen.map((e) => e.event)).toEqual(["kept"]);
  });

  it("routes the default sink by level: error to console.error, warn to console.warn, info to console.log", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createLogger({ level: "info" });
    log.error("e");
    log.warn("w");
    log.info("i");
    expect(JSON.parse(String(err.mock.calls[0]![0]))).toMatchObject({ level: "error", event: "e" });
    expect(JSON.parse(String(warn.mock.calls[0]![0]))).toMatchObject({ level: "warn", event: "w" });
    expect(JSON.parse(String(out.mock.calls[0]![0]))).toMatchObject({ level: "info", event: "i" });
  });
});

describe("@hardkas/observability · metrics and Prometheus text", () => {
  it("counts by label set, whatever the label order, and refuses an unregistered metric", () => {
    const m = createMetricRegistry();
    m.register({ name: "rpc_calls_total", help: "RPC calls", type: "counter" });
    m.register({ name: "rpc_calls_total", help: "ignored second registration", type: "gauge" });
    m.inc("rpc_calls_total", { method: "getInfo", ok: true });
    m.inc("rpc_calls_total", { ok: true, method: "getInfo" }, 2);
    m.inc("rpc_calls_total", { method: "submit", ok: false });
    m.dec("rpc_calls_total", { method: "submit", ok: false });
    const [record] = m.getMetrics();
    expect(record!.def.help).toBe("RPC calls");
    expect(record!.values.map((v) => v.value)).toEqual([3, 0]);
    expect(() => m.inc("missing_total")).toThrow("Metric missing_total not registered");
    m.clear();
    expect(m.getMetrics()).toEqual([]);
  });

  it("writes HELP, TYPE and one line per label set, escapes label values and ends with a newline", () => {
    const m = createMetricRegistry();
    m.register({ name: "queue_depth", help: "Jobs waiting", type: "gauge" });
    m.set("queue_depth", 7);
    m.set("queue_depth", 2, { path: 'C:\\q "a"\nb' });
    expect(toPrometheusText(m)).toBe(
      "# HELP queue_depth Jobs waiting\n" +
        "# TYPE queue_depth gauge\n" +
        "queue_depth 7\n" +
        'queue_depth{path="C:\\\\q \\"a\\"\\nb"} 2\n'
    );
    expect(toPrometheusText(createMetricRegistry())).toBe("");
  });
});

describe("@hardkas/observability · health", () => {
  it("reports up, the time, the uptime and memory, and components only when given", () => {
    const h = getHealthSnapshot();
    expect(h.status).toBe("up");
    expect(Number.isNaN(Date.parse(h.timestamp))).toBe(false);
    expect(h.uptimeSeconds).toBeGreaterThanOrEqual(0);
    for (const k of ["rss", "heapTotal", "heapUsed", "external"] as const) expect(typeof h.memoryUsage[k]).toBe("number");
    expect(h).not.toHaveProperty("components");
    expect(getHealthSnapshot({ rpc: "ok" }).components).toEqual({ rpc: "ok" });
  });
});
