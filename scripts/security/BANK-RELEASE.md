# Enable Banking: local repair and release sequence

The repair is limited to bank authorization, central connection state, and automatic invoice reconciliation. Existing central rows remain in place. No connection is imported or reassigned from a browser bearer session. LocalStorage-only sessions without an established central binding require a new bank consent.

## Validation

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun run test`
- `bun run lint`
- `bun run build`
- `deno check --no-lock supabase/functions/enable-banking/index.ts`
- With a dedicated **synthetic** PostgreSQL cluster listening on **127.0.0.1:55441**, authenticated as the local bootstrap user `bank_test`: `node scripts/security/test-bank.mjs`.

The database test creates its own uniquely named database. It never reads a Supabase URL or a production connection string. `BANK_PG_BIN` selects the local PostgreSQL executable directory. Test reports go to the local temporary directory, or `BANK_TEST_REPORT`. No existing cluster is stopped or restarted.

Matching runs inside a service-only, SECURITY INVOKER RPC. The payment evidence, `paid_at`, invoice status, and immutable audit event commit together. Locks coordinate matching, reconnecting, and disconnecting for the same user. A stable account identification hash and bank `entry_reference` prevent replay across devices and new sessions. Missing stable identifiers are shown but never auto-settled. Only booked incoming EUR credits can pay a sent invoice. Invoice-number matches must be unique and complete; names are matched exactly to the debtor, and ambiguity is left unresolved. Already-paid references cannot fall back to another invoice.

## Production preflight, before mutation

1. Verify the current GitHub main revision, the deployed `enable-banking` function revision, and the Cloudflare production route. The Worker named `gebcalc-staging` serves the production custom domain.
2. Obtain an authorized restorable database backup before applying a schema migration; retain the current Edge function source and Worker version for recovery. Test the release against an isolated synthetic environment first.
3. Read-only review of existing central Enable Banking bindings: check for conflicting ownership, repeated account/session identifiers across users, and unexpected providers/statuses. Do not print bank identifiers. The repair prevents future client forgery and validates provider membership; it does not establish historical provenance for rows created before the repair. Resolve any conflicting historical binding explicitly before release. Do not automatically overwrite or reassign it.
4. Confirm the standard `SUPABASE_SERVICE_ROLE_KEY` server secret is available and the configured callback URL stays unchanged. Never expose secrets to the browser or logs.

## Release order

After reviewing the tested changes and authorizing production rollout:

1. Apply `20261004173632_secure_enable_banking_reconciliation.sql` as one transaction. It adds the nonce/evidence tables and service-only RPCs, and prevents client writes to Enable Banking connections. It does not rewrite existing rows or alter other bank providers.
2. Deploy the three files in `supabase/functions/enable-banking/` as the `enable-banking` function with JWT verification enabled. Keep the current signing secrets and callback URL.
3. Deploy the tested frontend bundle. The new frontend uses the protected server endpoints. The new backend rejects transaction requests from legacy clients with HTTP 426 and a reload message, preventing execution of the old browser matcher. The rest of the application continues to run. An in-flight consent started by an old client may need to be restarted once the new backend is deployed.
4. Check production read-only: authentication, central connection visibility, balances and non-reconciling transaction requests, newest-first ordering, and response/security headers. For any write or automatic reconciliation verification, use an explicitly isolated synthetic tenant and mock bank transactions. Do not open an authenticated real-bank dashboard as a read-only smoke test: it performs reconciliation.
5. Close Enable Banking only after verifying the deployed versions and release smoke checks. Subscription work follows that gate.

## Recovery

Do not roll back to the old insecure browser matcher or reopen client writes. Keep the new guard, payment evidence, and consumed nonce history. If a bank release check fails, keep the rest of the application online, return a controlled bank error while correcting the bank deployment, and preserve all successfully committed payment evidence. Database migrations are forward fixes; never drop evidence tables or blindly restore a backup over subsequent business writes. Re-run the isolated validation before a corrective deployment.

Reference: [Enable Banking API](https://enablebanking.com/docs/api/reference/), particularly account identification hashes, immutable entry references, transaction direction/status, pagination, and PSU identity hashes.
