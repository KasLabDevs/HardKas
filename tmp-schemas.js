import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(".hardkas/query.db");
const rows = db.prepare("SELECT count(*) as count FROM artifacts").all();
console.log(rows);
