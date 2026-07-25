# Preview Deployment Record

Date: 2026-07-25
Branch: `security/phase-1-hardening`
Production deployment: prohibited

## Deployment order

1. Apply the additive Plaid timestamp migration.
2. Read back both columns and migration history.
3. Persist and push only `security/phase-1-hardening`.
4. Authenticate Vercel and link the intended project.
5. Configure the exact protected Preview origin and private admin allowlist.
6. Confirm Vercel Node.js 22.x.
7. Deploy protected Preview.
8. Execute the security and Plaid browser checklists.
9. If validation fails, roll back the Preview application deployment. Do not
   drop the nullable columns unless a separately approved coordinated rollback
   is required.

Steps 1 through 3 are complete. The migration was the only pending migration,
schema read-back succeeded, and commit
`10b086829af3114a34238a1bedf880237fce9af8` was pushed only to
`origin/security/phase-1-hardening`. `origin/main` remained at
`990aed27f63a50f40d8d73db4585bc5c48a42363`.

## Branch diff classification

- Production code: authentication/OAuth, Gmail authorization, Origin checks,
  safe redirects, server-only Supabase administration, Plaid authorization,
  Update Mode, retry/timestamp behavior, protected internal routes, CSP, and
  related generated database types.
- Tests: Phase 1 authorization/security tests and Plaid Update Mode lifecycle,
  UI-state, migration, archive, and idempotency regressions.
- Documentation: audit matrices, Phase 1/1.5/1.6 reports, environment/Preview
  plans, rollback guidance, and this evidence set.
- Package/runtime: exact Next.js 16.2.11, matching `eslint-config-next`, lockfile,
  Node.js 22 engine, and `.nvmrc`.
- Supabase migration: the single additive Plaid repair timestamp migration.
- Excluded from this branch commit: the unrelated pre-existing
  `lib/financial-engine/semi-monthly-spending.ts` import-extension edit.

## Environment configuration

Required private Preview values:

- `MANSOR_ALLOWED_ORIGINS`: one exact, stable Preview origin only.
- `MANSOR_INTERNAL_ADMIN_EMAILS`: explicit authorized addresses only.
- Vercel runtime: Node.js 22.x.

No wildcard, `VERCEL_URL` inference, automatically generated Preview origin, or
committed private value is permitted.

## Current deployment status

The branch push triggered the GitHub `Vercel` commit status automatically. At
the last check it was `pending`, with Vercel deployment identifier
`4AKXK7Cm8LG4fUmfLD5JH2A9h3B4`.

Vercel CLI authentication is absent, so project identity, protection mode,
private environment configuration, deployment URL, and runtime remain
unverified. No manual Vercel deployment command completed.
