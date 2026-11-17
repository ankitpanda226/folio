import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
// Minimal D1 interface for local development/tests. The production Worker uses Cloudflare D1.
export function database(path = ':memory:') {
  if (path !== ':memory:') mkdirSync('.local', { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries){
    if(sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(tag))continue;
    sqlite.exec('BEGIN');
    try{sqlite.exec(readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8'));sqlite.prepare('INSERT INTO local_migrations VALUES (?)').run(tag);sqlite.exec('COMMIT');}
    catch(e){sqlite.exec('ROLLBACK');sqlite.close();throw e;}
  }
  function prepare(sql) {
    let params=[];
    return { bind(...values) { params=values; return this; },
      async first() { return sqlite.prepare(sql).get(...params) ?? null; },
      async all() { return {results:sqlite.prepare(sql).all(...params)}; },
      async run() { const r=sqlite.prepare(sql).run(...params); return {meta:{changes:Number(r.changes)}}; }
    };
  }
  return { prepare, async batch(statements) { sqlite.exec('BEGIN');try {const rows=[]; for(const s of statements) rows.push(await s.run());sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;} }, close:()=>sqlite.close() };
}
