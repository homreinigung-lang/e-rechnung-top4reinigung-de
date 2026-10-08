# Stripe Sandbox integration

For isolated testing, set `STRIPE_BILLING_MODE=sandbox`. The legacy switch
`STRIPE_SANDBOX_ENABLED=true` is accepted only when no explicit mode is configured.
Checkout defaults to off; invoice/bank-transfer ordering stays the default.
The UI only offers online payment when the server reports Sandbox availability.

## Configuration

- Use account `acct_1UNbGM3qVWPSPWYm` (Hom Reinigung Service Sandbox).
- Copy the six public price IDs from `.env.example` into `STRIPE_SANDBOX_PRICES`.
- Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as server secrets;
  never commit them or place them in `VITE_*` variables.
- Set `PUBLIC_SITE_URL` to the isolated deployment URL and `SUPABASE_URL` to an
  isolated project containing synthetic data. Production URLs are rejected.
- In that isolated database, apply the existing subscription billing migration
  `20261004161000_stripe_subscription_billing.sql` along with its prerequisites.
  This work does not apply any production migration.
- Configure an active, exclusive 19% Sandbox tax rate as `STRIPE_SANDBOX_TAX_RATE_ID`.
  The server checks it against the order totals; tax-free orders do not use it.
- Register `POST /api/public/stripe-webhook` on the isolated deployment for
  `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.created`, `customer.subscription.updated`, and
  `customer.subscription.deleted`. Configure its signing secret server-side.

## Release checks

Run tests and build before merging. Complete an isolated Checkout test using
synthetic accounts for monthly/yearly prices, Pro employee surcharges, trial,
payment failure and cancellation. Confirm signed events update only the matching
subscription owner. Verify an invalid signature and a Live event are rejected.
Checkout completion alone does not prove a payment succeeded; subscription state
is read back from Stripe. Replayed events repeat the same state update; late
invoice events cannot force a canceled subscription back to active.

See STRIPE-LIVE.md for the separately gated Live configuration.
Live activation and production database deployment remain separate release steps.
Do not enable Sandbox against the production Supabase project.

Checkout creation uses a stable opaque idempotency key per local subscription.
Submitting another order while a Checkout is pending is rejected by Stripe rather
than creating a second payment session. Changing/canceling a pending Checkout is
not implemented in this Sandbox release. The local tests simulate Stripe transport
and an authenticated context; they do not replace a real Sandbox payment or Auth/RLS test.
