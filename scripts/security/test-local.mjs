import { readFileSync } from 'node:fs';
import { sql } from './replay-local.mjs';
console.log(sql(readFileSync('scripts/security/rls.sql', 'utf8')).split('\n').at(-1));
console.log(sql(readFileSync('scripts/security/storno.sql', 'utf8')).split('\n').at(-1));

console.log(sql(readFileSync('scripts/security/task-reports.sql', 'utf8')).split('\n').at(-1));
console.log(sql(readFileSync('scripts/security/chat.sql', 'utf8')).split('\n').at(-1));
console.log(sql(readFileSync('scripts/security/assistant.sql', 'utf8')).split('\n').at(-1));

console.log(sql(readFileSync('scripts/security/qm.sql', 'utf8')).split('\n').at(-1));

console.log(sql(readFileSync('scripts/security/account-access.sql', 'utf8')).split('\n').at(-1));

console.log(sql(readFileSync('scripts/security/work-photos.sql', 'utf8')).split('\n').at(-1));

console.log(sql(readFileSync('scripts/security/stripe-checkout.sql', 'utf8')).split('\n').at(-1));
