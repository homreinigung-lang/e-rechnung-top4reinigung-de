# GebCalc production: Cloudflare + Supabase

Status: **production cutover completed**. The `main` branch is the production source, and the custom domain `e-rechnung.top4reinigung.de` is served by Cloudflare Workers.

> Note: the Worker is still named `gebcalc-staging` for historical reasons. The name must not be interpreted as a staging environment and should not be changed without a deliberate Cloudflare route migration.

## Current production stack

- Source control / production branch: GitHub `main`
- Runtime/hosting: Cloudflare Workers
- Production domain: `e-rechnung.top4reinigung.de`
- Database/Auth/Storage: Supabase project `squkjqvofugkanzuqtqn` (`Hom.r.ofice`)
- Email: direct Resend integration
- AI: independent provider path
- No staging deployment configuration is maintained in `wrangler.jsonc`

## Current verified code state

The production code uses the independent stack:

- Cloudflare Workers via Wrangler / `@cloudflare/vite-plugin`
- TanStack Start + React + Tailwind configured directly in the repository
- Supabase client and server clients configured from environment variables
- Google OAuth uses Supabase OAuth directly
- Email delivery is independent of Lovable
- AI calls use the independent provider path configured by environment variables
- The SSR error wrapper in `src/server.ts` is retained
- `supabase/config.toml` points to the final target project

Historical migration notes or commit history may still mention Lovable. Those references are not runtime dependencies and must not be used as cutover instructions.

## Runtime configuration

Names only; never commit secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- temporary legacy fallback only if still needed during migration: `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `GEMINI_API_KEY` (or the selected independent AI key)
- `PUBLIC_SITE_URL`

## Historical migration notes

The sections below describe safeguards used during the historical migration/cutover. They are retained for audit and recovery context and are **not** instructions to switch production back to Lovable.

The current production Supabase project is `Hom.r.ofice` (`squkjqvofugkanzuqtqn`). Historical source datasets must never be blindly restored over current production.

Do not use "newer wins" as a merge rule. Preserve soft-deleted records, audit history and explicit business decisions. Auth UUIDs differ between environments and require the established identity mapping; never perform a global UUID replacement.

## Backup package required before merge

Create one complete local migration package containing, for **both source environments**:

1. database/Auth backup or equivalent complete export required for local restore;
2. private Storage bytes for `firmen-dateien`;
3. a machine-readable Storage manifest (relative path, source, size, SHA-256);
4. database backup checksums;
5. the exact Git commit used for the migration tooling;
6. a reconciliation/operations manifest describing every intentional insert/update/keep/skip decision.

No password, API key, access token or service-role/secret key belongs in the package or repository.

## Storage rule

`scripts/migrate-storage.mjs` is a historical guarded uploader, not the final two-source merge tool. It contains a fixed owner UUID and fixed historical counts. Do not run it for the final migration unless its manifest is regenerated and reviewed from the actual downloaded Storage bytes.

The final Storage merge must be driven by the actual source manifests and SHA-256 checksums. Existing destination objects must never be overwritten silently.

## Local rehearsal sequence

Use only one local probe at a time:

1. restore the Lovable production backup locally and validate the export;
2. restore the `Hom.r.ofice` backup locally and validate the export;
3. build one merged local target using the reviewed operations manifest;
4. verify data counts, ownership mapping, Auth identities and Storage checksums;
5. run the rollback rehearsal;
6. record PASS/FAIL and the exact commit/backup checksums used.

Completed historical tests (build, typecheck, lint, migrations, Fahrtenbuch and RLS checks) are not to be repeated unless a relevant file or migration changed.

## Historical cutover gates

The following checklist was used for the migration. It is retained as historical reference and should not be treated as a pending production cutover checklist:

- complete DB/Auth backups from both sources are stored locally and checksum-verified;
- private Storage bytes from both sources are downloaded and SHA-256 verified;
- the reviewed local merge rehearsal passes;
- rollback rehearsal passes;
- owner and employee Auth mapping is verified in the merged target;
- historical PDFs/files open from the final Supabase Storage;
- Google OAuth is enabled and tested on the final Supabase project, or intentionally disabled for the initial cutover;
- direct email sending works;
- required AI-assisted features work independently or are explicitly disabled for the initial cutover;
- Cloudflare staging/runtime validation passes for the exact release commit;
- production environment variables, Auth redirect URLs and domain routing are prepared.

Production DNS/domain routing has already been switched to Cloudflare. Any future routing change must be treated as a new production migration and reviewed separately.

## Production deployment

Use the repository deployment command:

```sh
bun run deploy
```

This builds the application and deploys the Worker configured in `wrangler.jsonc`. Do not recreate a staging environment unless a separate staging design is explicitly required.
