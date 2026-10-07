const fs = require("fs");
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^?/, ""));
const [b, a] = process.argv.slice(2).map(read);
const diff = {};
for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) diff[k] = { before: b[k], after: a[k] };
console.log("differing keys:", JSON.stringify(Object.keys(diff)));
for (const [k, v] of Object.entries(diff)) if (k !== "classes" && k !== "mentions") console.log(k, JSON.stringify(v));
if (diff.classes) for (const c of Object.keys(a.classes)) console.log("class", c, "| removed before", JSON.stringify(b.classes[c].removed), "after", JSON.stringify(a.classes[c].removed), "| kept identical:", JSON.stringify(b.classes[c].kept) === JSON.stringify(a.classes[c].kept));
if (diff.mentions) console.log("mentions after:", JSON.stringify(a.mentions));
