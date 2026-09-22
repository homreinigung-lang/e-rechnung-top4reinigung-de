import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { sql, pgArgs, pgBin } from './replay-local.mjs';

const owner = randomUUID();
sql(`INSERT INTO auth.users(id,email) VALUES ('${owner}','concurrency@example.invalid');`);
function transaction(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn(`${pgBin}/psql`, [...pgArgs, '-At']);
    let out = '', err = '';
    child.stdout.on('data', x => out += x);
    child.stderr.on('data', x => err += x);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(out) : reject(new Error(err)));
    child.stdin.end(`BEGIN; SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claims','{"sub":"${owner}","role":"authenticated"}',true);
      ${statement}; COMMIT;`);
  });
}
const replies = await Promise.all(Array.from({length: 8}, () =>
  transaction("SELECT public.next_document_number('invoice'); SELECT pg_sleep(0.05)")));
const numbers = replies.flatMap(x => x.match(/^RE-\d{4}-\d+$/gm) || []);
assert.equal(numbers.length, 8);
assert.equal(new Set(numbers).size, 8, 'Concurrent reservations returned duplicate official numbers');
const id = randomUUID();
sql(`INSERT INTO public.documents(id,user_id,number,reverse_charge,tax_mode,vat_rate)
 VALUES ('${id}','${owner}','SYNTHETIC-DRAFT',false,'domestic',19);
 INSERT INTO public.document_items(user_id,document_id) VALUES ('${owner}','${id}');`);
const finalized = await Promise.all(Array.from({length: 4}, () =>
  transaction(`SELECT (public.finalize_document('${id}')).number`)));
const official = finalized.flatMap(x => x.match(/^RE-\d{4}-\d+$/gm) || []);
assert.equal(official.length, 4);
assert.equal(new Set(official).size, 1, 'Retry changed the official number');
assert.equal(sql(`SELECT count(*) FROM public.document_audit_log WHERE document_id='${id}' AND action='finalized'`), '1');
console.log('PASS: 8 concurrent reservations are unique; 4 simultaneous finalizations preserve one number and one audit record.');
const emailHash = owner.replaceAll('-', '').repeat(2);
const budgetReplies = await Promise.all(Array.from({length: 8}, () =>
  transaction(`SET LOCAL ROLE service_role; SELECT public.consume_mail_budget('${emailHash}','',3,15,20,60)`)));
assert.equal(budgetReplies.filter(x => /^t$/m.test(x)).length, 3, 'Concurrent mail attempts exceeded the limit');
assert.equal(budgetReplies.filter(x => /^f$/m.test(x)).length, 5);
console.log('PASS: 8 concurrent mail attempts allow exactly 3; 5 are rejected. No email was sent.');
const access = randomUUID(), token = randomUUID();
sql(`INSERT INTO public.accountant_access(id,user_id,token,access_code,access_code_hash)
 VALUES ('${access}','${owner}','${token}','','${'a'.repeat(64)}');`);
const attempts = await Promise.all(Array.from({length: 8}, () =>
  transaction(`SET LOCAL ROLE service_role; SELECT public.check_accountant_access('${token}','${'b'.repeat(64)}')->>'status'`)));
assert.equal(attempts.filter(x => /^invalid$/m.test(x)).length, 5);
assert.equal(attempts.filter(x => /^locked$/m.test(x)).length, 3);
assert.equal(sql(`SELECT failed_attempts FROM public.accountant_access WHERE id='${access}'`),'5');
assert.match(await transaction(`SET LOCAL ROLE service_role; SELECT public.check_accountant_access('${token}','${'a'.repeat(64)}')->>'status'`), /^locked$/m);
sql(`UPDATE public.accountant_access SET locked_until=now()-interval '1 minute' WHERE id='${access}'`);
assert.match(await transaction(`SET LOCAL ROLE service_role; SELECT public.check_accountant_access('${token}','${'a'.repeat(64)}')->>'status'`), /^ok$/m);
assert.equal(sql(`SELECT failed_attempts FROM public.accountant_access WHERE id='${access}'`),'0');
console.log('PASS: parallel accountant guesses lock after 5 failures; valid credentials work after the lock expires.');
