# Cloudflare + Supabase migration plan

Status: preparation only. Production (`main`) and the live Lovable deployment must remain unchanged until final verification.

## Target

- Hosting/runtime: Cloudflare Workers
- Backend/Auth/Database/Storage: user-owned Supabase
- Source control: GitHub

## Verified current dependencies

1. Core database/auth/storage already use `@supabase/supabase-js`.
2. Password sign-in, MFA, password reset and most application data access are direct Supabase calls.
3. Google OAuth currently goes through `@lovable.dev/cloud-auth-js` and must be replaced with direct Supabase OAuth before cutover.
4. The browser Supabase client contains Lovable preview-session brokerage and must be simplified for independent hosting.
5. Email delivery currently uses `connector-gateway.lovable.dev/resend` and requires `LOVABLE_API_KEY`; this must be replaced with direct Resend API usage before cutover.
6. AI document/project/receipt analysis currently uses `ai.gateway.lovable.dev` and `LOVABLE_API_KEY`; this must be replaced with an independent AI provider path before cutover.
7. Existing Vite configuration is supplied by `@lovable.dev/vite-tanstack-config`; independent Cloudflare configuration must reproduce the required TanStack Start, React, Tailwind, path alias and PWA behavior.
8. The current custom `src/server.ts` SSR error wrapper must be preserved or equivalently integrated in the Cloudflare Workers runtime.

## Cloudflare preparation

Cloudflare officially supports existing TanStack Start applications on Workers through `@cloudflare/vite-plugin` and Wrangler. The migration branch will add an independent Cloudflare configuration only after the Lovable-provided Vite behavior has been reproduced explicitly.

Required runtime configuration (names only; no secrets committed):

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` or an equivalent server-only Supabase secret key
- `RESEND_API_KEY`
- `RESEND_FROM`
- independent AI provider key(s), after the replacement provider is selected

## Cutover gates

Do not disconnect Lovable until all of these pass:

- Supabase Storage contains all 42 historical objects at the remapped owner paths.
- Owner and employee login succeed against the new Supabase project.
- RLS and storage access behave correctly for both accounts.
- Customers, documents, document items, number sequences, expenses, time entries, recurring invoices, roles/subscriptions and GoBD audit behavior are verified.
- Historical PDFs/files open and download correctly.
- Google OAuth is either reconfigured and tested or intentionally disabled for the first cutover.
- Email sending works without Lovable.
- AI-assisted features work without Lovable or are intentionally disabled for the first cutover.
- Cloudflare preview deployment builds and runs successfully.
- Core flows are smoke-tested on the Cloudflare preview.
- Production environment variables and domain routing are prepared.

Only after all gates pass should production DNS/domain routing and the live application be switched.