"use strict";
// SA-2 test harness (SECURITY-AUDIT-1, 2026-10-21): preloaded into the `hardkas dashboard` process under test. It records
// the host the code ASKED to listen on (SA2_LISTEN_LOG, one JSON line per listen call) and, when no loopback host was
// given, binds 127.0.0.1 instead, so the test never exposes the machine, even when it runs against code that would
// listen on every interface.
const net = require("node:net");
const fs = require("node:fs");

const LOG = process.env.SA2_LISTEN_LOG;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
const original = net.Server.prototype.listen;
net.Server.prototype.listen = function sa2Listen(...args) {
  let requestedHost;
  let port;
  if (args[0] !== null && typeof args[0] === "object") {
    requestedHost = args[0].host;
    port = args[0].port;
    if (!LOOPBACK.has(String(requestedHost))) args[0] = { ...args[0], host: "127.0.0.1" };
  } else {
    port = args[0];
    requestedHost = typeof args[1] === "string" ? args[1] : undefined;
    if (requestedHost === undefined) args.splice(1, 0, "127.0.0.1");
    else if (!LOOPBACK.has(requestedHost)) args[1] = "127.0.0.1";
  }
  if (LOG) {
    try {
      fs.appendFileSync(LOG, JSON.stringify({ port, requestedHost: requestedHost ?? null }) + "\n");
    } catch {
      /* recording never breaks the server */
    }
  }
  return original.apply(this, args);
};
