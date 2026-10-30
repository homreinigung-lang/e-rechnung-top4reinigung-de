import { readFileSync } from 'node:fs';
import { sql } from './replay-local.mjs';

// replay-local fixes the target to the loopback synthetic database. Never use
// production credentials here: the missing-helper case deliberately drops it.
const migration = readFileSync('supabase/migrations/20261029090000_allow_domestic_cleaning_13b.sql', 'utf8');
for (const missing of [false, true]) {
  if (missing) sql(`
    DROP TRIGGER trg_documents_plan_tax_mode ON public.documents;
    DROP FUNCTION public.enforce_plan_tax_mode();
    DROP FUNCTION public.plan_allows_reverse_charge(uuid);
  `);
  sql(migration);
  sql(migration); // A repeated application must preserve behaviour and ACLs.
  sql(readFileSync('scripts/security/domestic-tax.sql', 'utf8'));
  sql(readFileSync('scripts/security/rls.sql', 'utf8'));
  console.log(`PASS: tax migration upgrades ${missing ? 'missing' : 'existing'} helpers and trigger, is repeatable, preserves tax gates and RLS`);
}
