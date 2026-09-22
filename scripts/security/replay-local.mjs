import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

// Fixed loopback target and dedicated database. Never read a production URL.
export const pgBin = process.env.SECURITY_PG_BIN || 'C:/Program Files/PostgreSQL/17/bin';
export const pgArgs = ['-X', '-h', '127.0.0.1', '-p', '55439', '-U', 'security_test', '-d', 'security_verification', '-v', 'ON_ERROR_STOP=1'];
export function sql(text) {
  const result = spawnSync(`${pgBin}/psql`, [...pgArgs, '-At'], { input: text, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'psql failed');
  return result.stdout.trim();
}
if (process.argv[2] === '--initialize' || process.argv[2] === '--resume') {
  if (process.argv[2] === '--initialize') {
  const create = spawnSync(`${pgBin}/createdb`, ['-h', '127.0.0.1', '-p', '55439', '-U', 'security_test', 'security_verification'], { encoding: 'utf8' });
  if (create.status !== 0) throw new Error(create.stderr);
  sql(readFileSync('scripts/security/bootstrap.sql', 'utf8'));
  }
  let count = 0;
  for (const name of readdirSync('supabase/migrations').filter(n => n.endsWith('.sql')).sort()) {
    if (process.argv[2] === '--resume' && name < process.argv[3]) continue;
    // Local Windows Postgres has no pg_net/pg_cron. Only extension installation
    // is omitted; cron calls resolve to inert bootstrap functions above.
    const source = readFileSync(`supabase/migrations/${name}`, 'utf8')
      .replace(/^CREATE EXTENSION IF NOT EXISTS pg_(?:cron|net);\r?$/gm, '');
    try { sql(source); count++; }
    catch (error) { throw new Error(`Migration ${name}: ${error.message}`); }
  }
  console.log(`Replayed ${count} migrations into loopback-only synthetic database.`);
}
