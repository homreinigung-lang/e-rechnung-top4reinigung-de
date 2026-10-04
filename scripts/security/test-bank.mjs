import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
const bin=path.join(process.env.BANK_PG_BIN || 'C:/Program Files/PostgreSQL/17/bin','psql'+(process.platform==='win32'?'.exe':''));
const db='bank_repair_'+Date.now();
const args=['-X','-h','127.0.0.1','-p','55441','-U','bank_test','-v','ON_ERROR_STOP=1','-At'];
const root=fileURLToPath(new URL('../../',import.meta.url)).replaceAll('\\','/');
function sql(query,database=db){const r=spawnSync(bin,[...args,'-d',database],{input:query,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.error?.message);return r.stdout.replaceAll('\r\n','\n').trim();}
function concurrent(query){return new Promise((resolve,reject)=>{const p=spawn(bin,[...args,'-d',db],{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',status=>status===0?resolve(out.trim()):reject(Error(err)));p.stdin.end(query);});}
sql(`create database ${db};`,'postgres');
sql(fs.readFileSync(new URL('./bank-bootstrap.sql',import.meta.url),'utf8'));
const immutabilitySource=fs.readFileSync(root+'/supabase/migrations/20260819110144_697ace7a-473b-4c8c-9227-e7eaec44646f.sql','utf8');
const immutabilityFunction=immutabilitySource.match(/CREATE OR REPLACE FUNCTION public.documents_enforce_immutability\(\)[\s\S]*?END; \$function\$;/)[0];
sql(immutabilityFunction+'\ncreate trigger t_documents_immutable before update or delete on public.documents for each row execute function public.documents_enforce_immutability();');
sql(fs.readFileSync(root+'/supabase/migrations/20260813192337_87baafe2-5ed3-49a1-94ce-0b0e987c2e15.sql','utf8'));
const u='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', c='33333333-3333-4333-8333-333333333333';
sql(`insert into auth.users values('${u}'),('${other}');insert into bank_connections(id,user_id,provider,requisition_id,account_ids,status)values('${c}','${u}','enable_banking','session-a',array['account-a'],'connected');`);
sql(fs.readFileSync(root+'/supabase/migrations/20261004173632_secure_enable_banking_reconciliation.sql','utf8'));
const tests=[];
function check(name,run){try{run();tests.push({name,pass:true});console.log('PASS '+name);}catch(error){tests.push({name,pass:false,error:String(error)});console.log('FAIL '+name+': '+error.message);}}
function expectValue(actual,expected){if(String(actual)!==String(expected))throw Error(`expected ${expected}; got ${actual}`);}
function tx(overrides={}){return {entry_reference:'entry-1',booking_date:'2026-10-03',credit_debit_indicator:'CRDT',status:'BOOK',transaction_amount:{amount:'100.00',currency:'EUR'},debtor:{name:'Anna Muster'},remittance_information:['RE-2026-001'],...overrides};}
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
const reconcile=(payment=tx(),uid=u,session='session-a',hash='account-hash',account='account-a')=>`public.enable_banking_reconcile('${uid}','${c}','${session}','${account}','${hash}',${literal(payment)})`;
const seed=(rows=[{number:'RE-2026-001'}])=>rows.map((row,i)=>`insert into documents(id,user_id,number,total,status,customer_name,issue_date,is_storno,deleted_at)values('aaaaaaaa-aaaa-4aaa-8aaa-${String(i+1).padStart(12,'0')}','${row.user??u}','${row.number}',${row.total??100},'${row.status??'sent'}','${row.name??'Anna Muster'}','${row.issue??'2026-10-01'}',${row.storno??false},${row.deleted?'now()':'null'});`).join('\n');
const scenario=(query,rows)=>sql(`begin;${seed(rows)} set local role service_role;${query} rollback;`).split('\n').filter(line=>!['BEGIN','ROLLBACK','SET'].includes(line)&&!line.startsWith('INSERT')).join('\n');
check('Existing central connection preserved',()=>expectValue(sql('select count(*) from bank_connections where status=\'connected\';'),1));
check('Exact-number payment stores paid date and immutable evidence',()=>expectValue(scenario(`select ${reconcile()};select status||':'||paid_at from documents;select count(*) from enable_banking_payments;select action from document_audit_log;`).split('\n').slice(-3).join('|'),'paid:2026-10-03|1|payment_received'));
check('Finalized invoice contents remain protected by the existing GoBD trigger',()=>{try{scenario('update documents set total=101;');}catch(error){if(error.message.includes('unveränderbar'))return;throw error;}throw Error('Finalized invoice contents changed');});
for(const [name,change] of [['positive debit',{credit_debit_indicator:'DBIT'}],['pending',{status:'PDNG'}],['cancelled',{status:'CNCL'}],['USD',{transaction_amount:{amount:'100',currency:'USD'}}],['negative',{transaction_amount:{amount:'-100',currency:'EUR'}}],['sub-cent',{transaction_amount:{amount:'100.001',currency:'EUR'}}],['missing stable reference',{entry_reference:''}],['invalid date',{booking_date:'2026-02-30'}],['future date',{booking_date:'2099-01-01'}]])check('Reject '+name,()=>expectValue(scenario(`select ${reconcile(tx(change))} is null;select count(*) from enable_banking_payments;`).split('\n').join('|'),'t|0'));
for(const [name,row] of [['draft',{status:'draft'}],['already paid',{status:'paid'}],['cancelled invoice',{status:'cancelled'}],['storno',{storno:true}],['deleted',{deleted:true}],['later invoice',{issue:'2026-10-04'}],['wrong amount',{total:101}],['other tenant',{user:other}]])check('Skip '+name,()=>expectValue(scenario(`select ${reconcile()} is null;`,[{number:'RE-2026-001',...row}]),'t'));
check('Exact customer fallback with no invoice reference',()=>expectValue(scenario(`select ${reconcile(tx({remittance_information:['Cleaning']}))} is not null;`),'t'));
check('Ambiguous customer refused',()=>expectValue(scenario(`select ${reconcile(tx({remittance_information:['Cleaning']}))} is null;`,[{number:'RE-2026-001'},{number:'RE-2026-002'}]),'t'));
check('Previously manually paid invoice prevents customer fallback',()=>expectValue(scenario(`select ${reconcile(tx({remittance_information:['Cleaning']}))} is null;`,[{number:'RE-2026-001',status:'paid'},{number:'RE-2026-002'}]),'t'));
check('Number prefix does not match',()=>expectValue(scenario(`select ${reconcile(tx({remittance_information:['RE-2026-010'],debtor:{name:'Other'}}))} is null;`,[{number:'RE-2026-01'}]),'t'));
check('Number suffix is not mistaken for a complete invoice number',()=>expectValue(scenario(`select ${reconcile(tx({remittance_information:['RE-2026-001'],debtor:{name:'Other'}}))} is null;`,[{number:'2026-001'}]),'t'));
check('Number with an extra suffix is not mistaken for a shorter number',()=>expectValue(scenario(`select ${reconcile(tx({remittance_information:['RE-2026-001-A'],debtor:{name:'Other'}}))} is null;`),'t'));
check('Booked payment can use value date when booking date is absent',()=>expectValue(scenario(`select ${reconcile(tx({booking_date:undefined,value_date:'2026-10-03'}))} is not null;`),'t'));
check('Ambiguous invoice numbers do not fall back',()=>expectValue(scenario(`select ${reconcile()} is null;`,[{number:'RE-2026-001'},{number:'RE-2026-001',name:'Other'}]),'t'));
check('Reference to a paid invoice never pays another one',()=>expectValue(scenario(`select ${reconcile()} is null;`,[{number:'RE-2026-001',status:'paid'},{number:'RE-2026-002'}]),'t'));
check('Unicode customer name normalization works',()=>expectValue(scenario(`select ${reconcile(tx({remittance_information:['Cleaning'],debtor:{name:'Jorg Muller'}}))} is not null;`,[{number:'RE-2026-001',name:'Jörg Müller'}]),'t'));
check('Payment cannot be reused after reconnect or manual undo',()=>expectValue(scenario(`select ${reconcile()};update documents set status='sent',paid_at=null;select ${reconcile()} is null;select count(*) from enable_banking_payments;`).split('\n').slice(-2).join('|'),'t|1'));
check('Two different bank payments cannot settle the same invoice twice',()=>expectValue(scenario(`select ${reconcile()};select ${reconcile(tx({entry_reference:'entry-2'}))} is null;select count(*) from enable_banking_payments;`).split('\n').slice(-2).join('|'),'t|1'));
function denied(name,query){check(name,()=>{try{sql(`begin;set local role authenticated;set local "request.jwt.claim.sub"='${u}';${query} rollback;`);}catch(error){if(/permission denied|managed by the server/.test(error.message))return;throw error;}throw Error('Unauthorized operation succeeded');});}
denied('Client cannot modify account identifiers',`update bank_connections set account_ids=array['victim-account'] where id='${c}';`);
denied('Client cannot create Enable Banking connections',`insert into bank_connections(user_id,provider)values('${u}','enable_banking');`);
denied('Client cannot disguise Enable Banking as another provider',`update bank_connections set provider='gocardless' where id='${c}';`);
denied('Client cannot delete server bindings',`delete from bank_connections where id='${c}';`);
denied('Client cannot read OAuth nonces','select * from enable_banking_auth_states;');
denied('Client cannot forge durable payment evidence',`insert into enable_banking_payments values('fake','fake','${u}','aaaaaaaa-aaaa-4aaa-8aaa-000000000001','2026-10-03',100,'EUR',now());`);
denied('Client cannot invoke service-only matching RPC',`select ${reconcile()};`);
denied('Client cannot invoke service-only attach RPC',`select public.enable_banking_attach('${u}',${literal({session_id:'fake',accounts:[{uid:'victim-account'}]})});`);
check('Unrelated bank providers retain their existing behavior',()=>expectValue(sql(`begin;set local role authenticated;set local "request.jwt.claim.sub"='${u}';insert into bank_connections(user_id,provider)values('${u}','gocardless');select count(*) from bank_connections where provider='gocardless';rollback;`).split('\n').at(-2),1));
check('Stale session cannot disconnect a new connection',()=>expectValue(sql(`set role service_role;select public.enable_banking_disconnect('${u}','old-session');`),'SET\nf'));
check('Service attach blocks a cross-owner existing bank account',()=>{try{sql(`set role service_role;select public.enable_banking_attach('${other}',${literal({session_id:'new-session',accounts:[{uid:'account-a'}]})});`);}catch(error){if(error.message.includes('another user'))return;throw error;}throw Error('Cross-owner attach accepted');});
check('RLS hides another user payment evidence',()=>expectValue(scenario(`select ${reconcile()};set local role authenticated;set local "request.jwt.claim.sub"='${other}';select count(*) from enable_banking_payments;`).split('\n').at(-1),0));
check('Blocked account loses access',()=>expectValue(sql(`begin;insert into account_approvals values('${u}','blocked');set local role authenticated;set local "request.jwt.claim.sub"='${u}';select public.enable_banking_access();rollback;`).split('\n').at(-2),'f'));
check('Blocked account cannot be settled through service RPC',()=>{try{scenario(`select ${reconcile()};`,undefined);sql(`begin;insert into account_approvals values('${u}','blocked');${seed()}set local role service_role;select ${reconcile()};rollback;`);}catch(error){if(error.message.includes('Account access denied'))return;throw error;}throw Error('Blocked account paid');});
check('Blocked account cannot attach through service RPC',()=>{try{sql(`begin;insert into account_approvals values('${u}','blocked');set local role service_role;select public.enable_banking_attach('${u}',${literal({session_id:'blocked-session',accounts:[{uid:'blocked-account'}]})});rollback;`);}catch(error){if(error.message.includes('Account access denied'))return;throw error;}throw Error('Blocked account attached');});
check('Service key cannot delete durable payment evidence',()=>{try{sql('set role service_role;delete from enable_banking_payments;');}catch(error){if(error.message.includes('permission denied'))return;throw error;}throw Error('Service role can erase payment history');});
sql(`insert into enable_banking_auth_states values('nonce-a','${u}','psu-a',now()+interval '30 minutes',null),('expired','${u}','psu-a',now()-interval '1 minute',null);`);
check('Another user cannot redeem an OAuth nonce',()=>expectValue(sql(`set role service_role;with taken as(update enable_banking_auth_states set consumed_at=now() where state_hash='nonce-a' and user_id='${other}' and consumed_at is null and expires_at>now() returning psu_hash)select count(*) from taken;`).split('\n').at(-1),0));
check('Expired OAuth nonce cannot be redeemed',()=>expectValue(sql(`set role service_role;with taken as(update enable_banking_auth_states set consumed_at=now() where state_hash='expired' and user_id='${u}' and consumed_at is null and expires_at>now() returning psu_hash)select count(*) from taken;`).split('\n').at(-1),0));
const nonceRace=await Promise.all([1,2].map(()=>concurrent(`begin;set local role service_role;update enable_banking_auth_states set consumed_at=now() where state_hash='nonce-a' and user_id='${u}' and consumed_at is null and expires_at>now() returning psu_hash;select pg_sleep(0.1);commit;`)));
check('Real SQL nonce race permits only one callback',()=>expectValue(nonceRace.filter(text=>text.includes('psu-a')).length,1));
// Dedicated persistent dummy fixtures for two independent database sessions.
sql(seed());
const concurrentResults=await Promise.all([1,2].map(()=>concurrent(`begin;set local role service_role;select ${reconcile()};select pg_sleep(0.15);commit;`)));
check('Two devices pay exactly once under a real SQL race',()=>{expectValue(sql('select count(*) from enable_banking_payments;'),1);expectValue(sql('select count(*) from document_audit_log;'),1);expectValue(concurrentResults.filter(text=>text.includes('aaaaaaaa-aaaa-4aaa-8aaa-000000000001')).length,1);});
sql(`set role service_role;select public.enable_banking_disconnect('${u}','session-a');`);
check('Old refresh cannot reactivate a disconnected connection',()=>{try{sql(`set role service_role;select ${reconcile(tx({entry_reference:'late'}))};`);}catch(error){if(error.message.includes('Bank connection changed'))return;throw error;}throw Error('Stale connection settled');});
const result={database:db,loopbackOnly:true,tests,passed:tests.filter(t=>t.pass).length,total:tests.length};
const report=process.env.BANK_TEST_REPORT || path.join(os.tmpdir(),db+'-results.json');
fs.writeFileSync(report,JSON.stringify(result,null,2));
console.log('Report: '+report);
console.log(`${result.passed}/${result.total} database checks passed in isolated synthetic database.`);
if(result.passed!==result.total)process.exitCode=1;
