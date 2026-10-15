// Usage: node scripts/tests/supplements-db.mjs /absolute/path/to/@electric-sql/pglite/dist/index.js
// Runs against an isolated PostgreSQL engine; never contacts a live project.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(process.argv[2]);
const db = new PGlite();
await db.exec(`create role authenticated; create role anon; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;`);
await db.exec(
  await readFile(
    new URL(
      "../../supabase/migrations/20260801181145_62b8c153-8088-4fd7-80ef-e79ba1de099e.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(`alter type public.doc_type add value 'order';`);
// Minimal current schema required by this feature, on top of the original tenant policies.
await db.exec(`alter table public.documents
add project_id uuid, add customer_number text not null default '',
add customer_type text not null default 'firma', add tax_mode text not null default 'domestic',
add vat_rate numeric not null default 19, add title text not null default '', add order_number text not null default '',
add discount_percent numeric not null default 0, add discount_amount numeric not null default 0,
add net_total numeric not null default 0, add vat_amount numeric not null default 0,
add deleted_at timestamptz, add converted_document_id uuid references public.documents(id),
add customer_phone text not null default '', add service_description text not null default '',
add attachment_title text not null default '', add attachment_text text not null default '',
add discount_reason text not null default '', add service_period text not null default '',
add locked_at timestamptz, add pdf_path text not null default '', add pdf_sha256 text not null default '',
add archived_at timestamptz, add retention_until date generated always as ((issue_date + interval '10 years')::date) stored, add paid_at date, add reminder_level int not null default 0,
add last_reminder_at timestamptz, add recurring_invoice_id uuid, add recurring_run_date date;
alter table public.document_items add is_optional boolean not null default false;
create table public.project_rooms(id uuid primary key default gen_random_uuid());
create table public.document_audit_log(id uuid primary key default gen_random_uuid(),user_id uuid,document_id uuid,document_number text,action text,details jsonb);
alter table public.document_audit_log enable row level security;
create policy audit_own on public.document_audit_log for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
grant insert,select on public.document_audit_log to authenticated;`);
const migration = await readFile(
  new URL("../../supabase/migrations/20261014221452_aufmass_nachtraege.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
await db.exec(
  await readFile(
    new URL(
      "../../supabase/migrations/20261015064420_fix_supplement_invoice_generated_columns.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const owner = "11111111-1111-1111-1111-111111111111",
  other = "22222222-2222-2222-2222-222222222222";
await db.query("insert into auth.users values ($1),($2)", [owner, other]);
await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}';`);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const reject = async (sql, params = []) => assert.rejects(db.query(sql, params));
const [{ id: order }] = await q(
  `insert into public.documents(user_id,type,number,net_total,total) values ($1,'order','AB-1',100,119) returning id`,
  [owner],
);
const before = (await q("select * from public.documents where id=$1", [order]))[0];
await reject("select public.approve_supplement($1,$2)", [order, "Email"]);
const [{ id }] = await q("select public.create_supplement($1) as id", [order]);
await reject("select public.invoice_supplement($1)", [id]);
await reject("select public.complete_supplement($1)", [id]);
await reject("select public.approve_supplement($1,$2)", [id, "Email"]);
await q(
  `insert into public.document_items(user_id,document_id,description,quantity,unit_price) values ($1,$2,'Fenster',3,10)`,
  [owner, id],
);
await q(
  `insert into public.document_items(user_id,document_id,description,quantity,unit_price,is_optional) values ($1,$2,'Optional',1,100,true)`,
  [owner, id],
);
await reject("select public.approve_supplement($1,$2)", [id, ""]);
await db.exec(`set request.jwt.claim.sub='${other}';`);
await reject("select public.create_supplement($1)", [order]);
await reject("select public.approve_supplement($1,$2)", [id, "Email"]);
await db.exec(`set request.jwt.claim.sub='${owner}';`);
await q("select public.approve_supplement($1,$2)", [id, "Kundenfreigabe per E-Mail"]);
assert.equal(
  Number((await q("select total from public.documents where id=$1", [id]))[0].total),
  35.7,
);
await reject(`update public.documents set net_total=999 where id=$1`, [id]);
await reject(`delete from public.document_items where document_id=$1`, [id]);
await reject(`update public.document_items set document_id=$1 where document_id=$2`, [order, id]);
await reject(`delete from public.documents where id=$1`, [id]);
await reject(`select public.invoice_supplement($1)`, [id]);
await q(`select public.complete_supplement($1)`, [id]);
// Failed audit write rolls the invoice and claim back together.
await db.exec(
  "reset role; revoke insert on public.document_audit_log from authenticated; set role authenticated;",
);
await reject("select public.invoice_supplement($1)", [id]);
assert.equal(
  (await q("select converted_document_id from public.documents where id=$1", [id]))[0]
    .converted_document_id,
  null,
);
assert.equal((await q("select id from public.documents where type='invoice'")).length, 0);
await db.exec(
  "reset role; grant insert on public.document_audit_log to authenticated; set role authenticated;",
);
const [{ invoice }] = await q(`select public.invoice_supplement($1) as invoice`, [id]);
await reject(`select public.invoice_supplement($1)`, [id]);
assert.equal(
  (await q("select * from public.document_items where document_id=$1", [invoice])).length,
  1,
);
assert.equal(
  Number((await q("select total from public.documents where id=$1", [invoice]))[0].total),
  35.7,
);
assert.deepEqual(
  (await q("select retention_until from public.documents where id=$1", [invoice]))[0]
    .retention_until,
  (await q("select retention_until from public.documents where id=$1", [id]))[0].retention_until,
);
assert.deepEqual((await q("select * from public.documents where id=$1", [order]))[0], before);
assert.equal((await q("select * from public.document_audit_log")).length, 4);
await db.exec("set role anon;");
await reject("select public.create_supplement($1)", [order]);
console.log(
  "PASS: tenant isolation, approval evidence, price/line freezing, completion gate, single invoicing, optional exclusion, unchanged original, atomic audit and anonymous denial.",
);
await db.close();
