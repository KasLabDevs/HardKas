import fs from "node:fs";
import path from "node:path";
const REPO = "C:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo";
const ref = JSON.parse(fs.readFileSync(REPO + "/docs/reference/cli.generated.json", "utf8"));
const root = { name: "hardkas", subcommands: ref.commands, options: [{ flags: "--version" }], arguments: [] };
const longs = (c) => (c.options || []).flatMap((o) => (o.flags.match(/--[a-z0-9-]+/gi) || []));
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.mdx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const docsRoot = REPO + "/apps/docs/docs";
const files = walk(docsRoot).filter((f) => {
  const r = path.relative(docsRoot, f).replace(/\\/g, "/");
  return !r.startsWith("reference/cli/") && !r.includes("/generated/") && !r.startsWith("reference/sdk/");
});
const results = [];
for (const f of files) {
  const rel = path.relative(docsRoot, f).replace(/\\/g, "/");
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    const cands = [];
    if (inFence) {
      const m = line.match(/^\s*(?:\$\s+)?(?:npx\s+|pnpm\s+(?:exec\s+)?)?hardkas\s+([a-z].*)$/);
      if (m) cands.push(m[1]);
    } else {
      for (const m of line.matchAll(/`(?:npx\s+|pnpm\s+(?:exec\s+)?)?hardkas\s+([a-z][^`]*)`/g)) cands.push(m[1]);
    }
    for (let c of cands) {
      c = c.split(/\s+#\s|\s*\||\s*&&|\s*;|\s\\$/)[0].trim();
      const toks = c.split(/\s+/).filter(Boolean);
      results.push({ rel, line: i + 1, text: "hardkas " + c, err: check(toks) });
    }
  });
}
function check(toks) {
  let node = root; const chain = [root]; let descending = true; const errs = [];
  for (let k = 0; k < toks.length; k++) { const t = toks[k];
    if (t.startsWith("-")) {
      if (!t.startsWith("--")) continue; // short flags: skip
      const name = t.split("=")[0];
      if (name === "--help") continue;
      const all = chain.flatMap(longs);
      const ok = all.includes(name) || (name.startsWith("--no-") && all.includes("--" + name.slice(5))) || all.includes("--no-" + name.slice(2));
      const opt = chain.flatMap((c) => c.options || []).find((o) => (o.flags.match(/--[a-z0-9-]+/gi) || []).includes(name));
      if (opt && /<[^>]+>/.test(opt.flags) && !t.includes("=")) k++;
      if (!ok) errs.push("unknown option " + name + " on '" + chain.map((c) => c.name).join(" ") + "'");
      continue;
    }
    if (/^[<\[{.'"$]/.test(t)) { descending = false; continue; }
    if (descending && node.subcommands && node.subcommands.length) {
      const sub = node.subcommands.find((s) => s.name === t || (s.aliases || []).includes(t));
      if (sub) { node = sub; chain.push(sub); continue; }
      if (!(node.arguments || []).length) { errs.push("unknown command '" + chain.map((c) => c.name).join(" ") + " " + t + "'"); break; }
    }
    descending = false;
  }
  return errs.join("; ");
}
const bad = results.filter((r) => r.err);
console.log("files", files.length, "invocations", results.length, "invalid", bad.length);
for (const b of bad) console.log(`${b.rel}:${b.line} | ${b.text.slice(0, 90)} | ${b.err}`);
