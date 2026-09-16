# Fahrtenbuch PDF + GoBD send-flow release checklist

This checklist is not a legal certification. The proposed code is validated by TypeScript/build on staging but requires isolated integration testing before production release.

- Draft remains editable; invoice is finalized, original PDF archived and SHA-256 verified before sending email.
- Archive failure prevents email. Email-provider failure leaves `sent_at` empty with visible `Versand ausstehend`; successful provider response with failed status update must not show a false all-success message.
- Fahrtenbuch page and accountant payroll section use the same `buildAccountantFahrtenbuchPdf` function, with a staff section link.
- Test in isolated environment with mock mail and database: success, archive failure, email failure, DB status failure, retry using original PDF, mismatched archived PDF, and storage permission restrictions.
- No invoice/quote PDF renderer changes, historical invoice changes, invoice creation/cancellation, or GoBD export should be part of release verification.
- Historical RE-2026-0003 remains pending original-file upload/verification in production storage; do not set retroactive archival timestamps.
- Never merge all staging into main: stage and main diverged. Review only the narrowly scoped application-file diff.
