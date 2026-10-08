# Stripe Live activation

This change prepares Live support but does not enable or deploy it. Keep
`STRIPE_BILLING_MODE=off` and `STRIPE_LIVE_ENABLED=false` until release checks pass.
The existing invoice/bank-transfer ordering flow remains available while disabled.

## Account and server configuration

Complete Stripe account activation, company/identity verification and payout bank
details in the account Dashboard. The account owner completes these steps and
accepts any account agreement. Account `acct_1UNbG74EaoDC9F9i` was observed as the
Live parent of the existing Sandbox; confirm this account during configuration.

Create the three products and six recurring prices in Live (EUR, exclusive tax):
Basis 2999/29990 cents, Pro 6999/69990 cents, Enterprise 13000/130000 cents.
Configure the public IDs in `STRIPE_LIVE_PRICES`, using keys
`basis_monthly`, `basis_yearly`, `pro_monthly`, `pro_yearly`,
`enterprise_monthly`, `enterprise_yearly`. Sandbox IDs never fall back into Live.
Configure an active exclusive 19% rate in `STRIPE_LIVE_TAX_RATE_ID` to match the
existing server-side order tax calculations.

Store `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Cloudflare server secrets,
never GitHub source, `VITE_*` variables, or chat. Use an appropriately restricted
Live API key when possible: read the account, prices, tax rates and subscriptions;
create Checkout sessions. Configure `STRIPE_LIVE_ACCOUNT_ID` and the HTTPS
`PUBLIC_SITE_URL`. Checkout refuses accounts that do not match or lack enabled
charges/payouts. Signed lifecycle webhooks still work if charges later become disabled.

Register `/api/public/stripe-webhook` in Live for the same six events listed in
STRIPE-SANDBOX.md. Set webhook API version `2026-09-30.endive`, matching the version
pinned in server requests. Live/test events and price/rate objects must match
the configured mode. The UI hides online payment until server configuration
includes the signing secret, all six price IDs and a tax rate ID.

## Release gates

1. Complete a real Stripe Sandbox flow with synthetic customers and test payment
   methods, including successful/failed payment, cancellation and trial behavior.
   Local transport/database/auth mocks do not replace this check.
2. Verify the production database has the existing order ownership and Stripe
   billing migrations. If database changes are needed, finish the deferred
   restorable backup step before applying them. Do not bypass that release gate.
3. Run Build, tests, types, source/security checks and review the exact deployment.
4. Only after account/configuration and release checks, explicitly set
   `STRIPE_BILLING_MODE=live` and `STRIPE_LIVE_ENABLED=true` on the deployed server.

Pending Checkout modification/cancellation, paid-plan changes and resubscription
after cancellation need a separate management flow before broad rollout. This
version deliberately blocks creating another online subscription when a Stripe
subscription is already attached to the local subscription.
