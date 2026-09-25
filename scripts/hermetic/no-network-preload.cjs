"use strict";
// Preloaded into every Node process of the hermetic gate (NODE_OPTIONS=--require).
// Refuses TCP connections to anything but loopback and records every attempt,
// so a test that quietly depends on a remote host, a public registry or a
// release download fails here instead of passing on a connected machine.
// Loopback attempts are recorded too (not refused) so the run can be reviewed
// for dependencies on locally running services.
const net = require("node:net");
const dns = require("node:dns");
const fs = require("node:fs");

const LOG = process.env.HARDKAS_HERMETIC_LOG;
// HARDKAS_HERMETIC_TRACE=1 appends the call site of every attempt (to find which test made it).
const TRACE = process.env.HARDKAS_HERMETIC_TRACE === "1";
// HARDKAS_HERMETIC_DENY_PORTS=a,b,c refuses loopback connections to those ports too, to prove
// the gate does not depend on a service that happens to run on this machine (e.g. a local kaspad).
const DENY_PORTS = new Set(
  String(process.env.HARDKAS_HERMETIC_DENY_PORTS ?? "")
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((p) => Number.isInteger(p) && p > 0)
);

function record(kind, target) {
  if (!LOG) return;
  try {
    let where = "";
    if (TRACE) {
      const frames = String(new Error().stack ?? "")
        .split("\n")
        .slice(1)
        .filter((line) => !/no-network-preload|node:internal|node:net|node:dns|node:events/.test(line))
        .slice(0, 6)
        .map((line) => line.trim());
      where = `\t${frames.join(" <- ")}`;
    }
    fs.appendFileSync(LOG, `${new Date().toISOString()}\t${kind}\t${target}\tpid=${process.pid}${where}\n`);
  } catch {
    // Recording must never break the process under test.
  }
}

function isLoopbackHost(host) {
  const h = String(host).replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "::1" || h === "::" || h === "0.0.0.0" || h.startsWith("127.") || h === "::ffff:127.0.0.1";
}

function hermeticError(target) {
  const err = new Error(`HERMETIC_GATE: refused non-loopback network access to ${target}`);
  err.code = "EHERMETIC";
  return err;
}

// net.Socket.prototype.connect is the choke point for net.connect, http/https
// agents, undici (fetch), ws and tls (TLSSocket extends Socket).
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function hermeticConnect(...args) {
  let host;
  let port;
  const first = args[0];
  if (Array.isArray(first)) {
    // Internal normalized form: [options, callback]
    const options = first[0];
    if (options && typeof options === "object" && !options.path) {
      host = options.host === undefined ? "localhost" : options.host;
      port = options.port;
    }
  } else if (first && typeof first === "object") {
    if (!first.path) {
      host = first.host === undefined ? "localhost" : first.host;
      port = first.port;
    }
  } else if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) {
    port = Number(first);
    host = typeof args[1] === "string" ? args[1] : "localhost";
  }
  // IPC paths (first is a non-numeric string or options.path) are always allowed.
  if (host !== undefined) {
    const target = `${host}:${port}`;
    if (!isLoopbackHost(host)) {
      record("REFUSED_CONNECT", target);
      const err = hermeticError(target);
      process.nextTick(() => this.emit("error", err));
      return this;
    }
    if (DENY_PORTS.has(Number(port))) {
      record("REFUSED_LOOPBACK_PORT", target);
      const err = hermeticError(`${target} (denied loopback port)`);
      process.nextTick(() => this.emit("error", err));
      return this;
    }
    record("LOOPBACK_CONNECT", target);
  }
  return originalConnect.apply(this, args);
};

// Name resolution of non-loopback names is refused as well, so nothing can
// learn an address it is not allowed to connect to.
const originalLookup = dns.lookup;
dns.lookup = function hermeticLookup(hostname, ...rest) {
  if (!isLoopbackHost(hostname)) {
    record("REFUSED_DNS", String(hostname));
    const callback = rest[rest.length - 1];
    const err = hermeticError(String(hostname));
    if (typeof callback === "function") {
      process.nextTick(() => callback(err));
      return;
    }
    throw err;
  }
  return originalLookup.call(dns, hostname, ...rest);
};
if (dns.promises && typeof dns.promises.lookup === "function") {
  const originalPromiseLookup = dns.promises.lookup;
  dns.promises.lookup = function hermeticPromiseLookup(hostname, ...rest) {
    if (!isLoopbackHost(hostname)) {
      record("REFUSED_DNS", String(hostname));
      return Promise.reject(hermeticError(String(hostname)));
    }
    return originalPromiseLookup.call(dns.promises, hostname, ...rest);
  };
}
