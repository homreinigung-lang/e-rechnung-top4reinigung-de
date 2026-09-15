# GebCalc final migration package

This file defines the reproducible package used for the final Lovable → Cloudflare + Supabase cutover.

## Release identity

Record before creating any real backup:

- Git branch: `migration/final-cleanup`
- Release commit: `<fill exact SHA after package cleanup is complete>`
- Target Supabase project ref: `squkjqvofugkanzuqtqn`
- Target runtime: Cloudflare Workers
- Production remains unchanged until explicit cutover approval.

## Local package layout

Keep this structure outside the repository:

```text
gebcalc-migration/
  release/
    release-sha.txt
    checksums.sha256
  lovable-prod/
    db/
    auth/
    storage/
    manifests/
  hom-r-office/
    db/
    auth/
    storage/
    manifests/
  merge/
    operations-manifest.json
    auth-map.json
    storage-manifest.json
    reports/
  rollback/
    reports/
```

Do not place database passwords, Supabase secret/service-role keys, OAuth secrets, access tokens or other credentials in this directory if it will be shared or committed.

## Source identities

### Source A — live Lovable production

- Supabase project ref: `betknvsgnfsoclihswzy`
- Role: source of truth for ongoing production writes until cutover

### Source B — Hom.r.ofice

- Supabase project ref: `squkjqvofugkanzuqtqn`
- Role: divergent user-owned dataset and final target project

Do not infer conflicts using timestamps alone.

## Required database/Auth artifacts

For each source, capture the complete database/Auth material required for a faithful local restore. Store the exact export command/tool version and SHA-256 of every produced backup file.

The export is considered complete only after a local restore succeeds.

## Required Storage artifacts

Bucket: `firmen-dateien`

For every downloaded object record:

- source project
- bucket
- original object path
- mapped owner/path if applicable
- byte size
- SHA-256
- content type if available
- source updated timestamp as evidence only

Do not treat ETag or size equality as a substitute for SHA-256 byte verification.

## Auth mapping

Auth user UUIDs differ between environments. The final merge must use an explicit identity map based on the previously verified user identities/provider identifiers.

Rules:

- no global UUID search/replace;
- remap ownership table by table/path by path;
- preserve audit history;
- verify owner and employee identities independently;
- abort if an unexpected identity appears.

## Merge operations manifest

`merge/operations-manifest.json` must describe every intentional operation in machine-readable form. Each operation should contain at least:

```json
{
  "entity": "table-or-storage",
  "key": "stable-business-or-row-key",
  "source": "lovable|hom|derived",
  "action": "keep|insert|update|skip|archive",
  "reason": "reviewed rule or business decision",
  "precondition": "expected target state",
  "notes": "optional"
}
```

The merge must abort when a precondition does not match. Avoid blind UPSERTs.

## Confirmed business rules to preserve

- Platform settings: keep the productive Lovable recipient/bank connection rather than the weaker Hom variant.
- Offer `AN-2026-0003`: keep the approved Hom intro text.
- Current affected Minijob employee: 2 h/day, no pause, 10 h/week; this rule is employee-specific and not a global default.
- Plan approval is per exact task/plan. Use the updated 08.09 plan only when it is the approved revision of that exact plan.
- Four exclusive deleted draft documents stay deleted/draft; do not reactivate them.
- Numeric floating representation differences such as `499.40000000000003` vs `499.4` are representation differences; derive canonical monetary totals from business values while archiving source evidence.
- `RE-2026-0008`: do not auto-mark paid without independent payment evidence.
- Invitation codes: preserve compatibility until verified; do not invalidate existing invitations blindly.
- Signature/logo: preserve the most complete actually usable final asset set, migrate its files into final Supabase Storage, and remove technical Lovable dependency.

## Local rehearsal gates

PASS requires all of the following:

- Source A restore succeeds locally.
- Source B restore succeeds locally.
- Merge probe succeeds from a clean target.
- All expected FK/ownership checks pass.
- Auth mapping is complete for known users.
- Storage manifest contains all downloaded source objects.
- SHA-256 verifies every copied Storage byte.
- Historical/deleted states remain preserved.
- Rollback rehearsal restores the pre-cutover state.

If any gate fails, stop before production cutover.

## Production cutover package

The final cutover must be reproducible from:

1. this repository at the recorded release SHA;
2. the two verified source backups;
3. the two verified source Storage snapshots;
4. the reviewed operations manifest;
5. the explicit Auth map;
6. the final Storage manifest/checksums;
7. the rollback instructions/report.

No live production write, DNS change, `main` merge or Lovable shutdown is authorized by this document alone.
