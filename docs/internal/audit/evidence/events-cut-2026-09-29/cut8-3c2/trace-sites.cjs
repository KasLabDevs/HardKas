// Prints the call sites the hermetic preload recorded (HARDKAS_HERMETIC_TRACE=1) for one target.
// usage: node trace-sites.cjs <hermetic-network.log> <host:port>
const fs = require("fs");
const [file, target] = process.argv.slice(2);
const strip = (s) => s.replace(/file:\/\/\/C:\/Users\/jrodr\/AppData\/Local\/Temp\/hk-3c1\/wt\//g, "").replace(/C:\\Users\\jrodr\\AppData\\Local\\Temp\\hk-3c1\\wt\\/g, "");
for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
  if (!line.includes(target)) continue;
  const [ts, kind, tgt, pid, where = ""] = line.split("\t");
  console.log(`${ts} ${kind} ${tgt} ${pid}`);
  for (const frame of where.split(" <- ")) console.log(`    ${strip(frame).slice(0, 200)}`);
}
