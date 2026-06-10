import Database from 'better-sqlite3';
const db = new Database(':memory:');
console.log('Reader:', db.prepare('SELECT 1 AS ok').reader);
