# Security Phase 1.6 Patch Report

Date: 2026-07-24
Status: implemented locally; not committed, merged, or deployed

## Outcome

The approved patch is complete:

| Package | Before | After |
| --- | --- | --- |
| `next` | `16.2.10` (`^16.2.10` manifest range) | exact `16.2.11` |
| `eslint-config-next` | exact `16.2.9` | exact `16.2.11` |
| `react` | `19.2.4` | unchanged |
| `react-dom` | `19.2.4` | unchanged |
| `eslint` | `9.x` (`9.39.4` installed) | unchanged |

The first post-install check found a stale physical `node_modules/next` at
16.2.10 despite the updated lock. `npm ci` rebuilt `node_modules` from the lock;
the executable and production build then both reported Next.js 16.2.11.

## Package and runtime files

- `package.json`: exact approved package versions and `engines.node = "22.x"`.
- `package-lock.json`: only the approved Next.js family, matching SWC optional
  packages, matching ESLint plugin/config, and the root Node engine changed.
- `.nvmrc`: `22`, for local version managers.

No scripts changed. No environment values were added to package files. No
database, migration, RLS, or financial-data change was made.

## Focused configuration hardening

Phase 1.6 required Preview origins not to be trusted automatically and malformed
security configuration to fail closed:

- `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` no longer implicitly enter
  the mutation Origin allowlist.
- `MANSOR_ALLOWED_ORIGINS` accepts exact comma-separated HTTP(S) origins only.
  One malformed or empty entry invalidates the full configured set.
- `MANSOR_INTERNAL_ADMIN_EMAILS` trims and lowercases comma-separated addresses.
  One malformed or empty entry invalidates the full set.
- Regression tests cover both fail-closed behaviors.

## Validation

All commands used Node `v22.23.1`.

| Gate | Result |
| --- | --- |
| clean install | pass (`npm ci`, 379 packages audited) |
| full tests | pass: 118/118 |
| TypeScript | pass |
| ESLint | pass |
| production build | pass; Next.js 16.2.11 |
| `git diff --check` | pass |
| development smoke | pass on port 3101 |
| production start smoke | pass on port 3102 |
| `npm audit` | completed; 12 high package entries remain |

Tests emit the existing Node module-type performance warning; it is not hidden
and did not fail the suite.

## Risk and rollback

Residual risks are documented in the audit and PostCSS/Sharp reviews. The patch
does not claim to clear all npm advisories.

Rollback, before any merge:

1. Restore `package.json` and `package-lock.json` to the reviewed pre-patch
   revisions.
2. Remove `.nvmrc` only if Node 22 standardization is also being rolled back.
3. Run `npm ci`.
4. Re-run tests, type checking, lint, build, and audit.

Do not partially roll back `next` without also restoring the matching
`eslint-config-next`, `@next/env`, SWC packages, and lockfile.
