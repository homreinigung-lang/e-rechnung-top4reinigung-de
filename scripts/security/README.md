# Security verification

`security-source.yml` runs redacted Gitleaks history scans, five tested Semgrep
rules, and synthetic PostgreSQL access/concurrency tests on PRs and daily.
`security-dependencies.yml` fails on high/critical dependency advisories.
The build workflow runs the application unit tests and production build.

## Notifications

GitHub Actions email notifications must be enabled for failed workflows in the
maintainer's GitHub notification settings. Dependabot email alerts are separate.
Run **Source security checks** manually with `notification_test` selected to
produce an intentionally failed **Security alert delivery test**. This does not
change application data. Confirm actual inbox receipt before calling delivery
verified; a failed run alone is not proof of delivery.

Treat leaked credentials, critical/high advisories, and failed access-control
tests as urgent: investigate promptly, block the affected release, and revoke a
confirmed exposed credential through its provider. Triage lower-severity
advisories weekly, recording the affected version, applicability and fix. The
scanner covers five specific unsafe patterns, not every possible vulnerability.

## Isolated database tests

The scripts connect only to `127.0.0.1:55439`, user `security_test`, database
`security_verification`. They never load a production URL or production data.
The CI PostgreSQL service is disposable. On Windows, use PostgreSQL 17 binaries
or set `SECURITY_PG_BIN` to the local binary directory.

1. Start a dedicated PostgreSQL instance on that loopback port.
2. Run `node scripts/security/replay-local.mjs --initialize` once.
3. Run `node scripts/security/test-local.mjs`.
4. Run `node scripts/security/concurrency.mjs`.

Auth claims and Storage metadata are synthetic stand-ins. The Windows-compatible
replay omits pg_net/pg_cron installation and uses inert cron functions. These
tests do not prove real Storage API behavior, deployed JWT configuration,
email delivery, or authenticated browser PDF rendering.

## Release order and rollback

Apply only the new forward migration after checking installed function bodies;
do not replay the repository's old migrations onto production. The migration
preserves installed finalize/storno definitions and adds row locks. It aborts
if their expected source statement has changed. Apply the migration before
deploying the app because public mail and accountant access use its new RPCs.

No existing invoice or file is rewritten. Concurrent number reservations are
unique and never reuse an already reserved counter; abandoned reservations can
leave gaps. Invoice numbers already stored are preserved on finalization.

Roll back the Worker to its recorded previous version if runtime smoke tests
fail. The forward database additions are compatible with the old app and may
remain in place; do not reset counters, unlock invoices or alter archived PDFs
as part of application rollback. Keep schema-definition snapshots privately,
outside Git, for a separately reviewed database rollback if ever required.
