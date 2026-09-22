import { readFileSync } from 'node:fs';
import { sql } from './replay-local.mjs';
console.log(sql(readFileSync('scripts/security/rls.sql', 'utf8')).split('\n').at(-1));
