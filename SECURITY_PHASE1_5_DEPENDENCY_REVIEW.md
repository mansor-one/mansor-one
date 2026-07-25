# Security Phase 1.5 — Dependency Review

Date: 2026-07-24
Status: review complete; no dependency changes applied.

## Executive decision

`npm audit` reports 12 high-severity package entries and no critical entries.
They are not 12 independent production exploits:

- three entries are in the deployed dependency graph: `next`, its bundled
  `postcss`, and optional runtime image processor `sharp`;
- nine entries are in ESLint and its plugins, which run in development and CI
  and are not bundled into the Vercel application.

The immediate production release blocker is `next@16.2.10`. The smallest
supported correction is `next@16.2.11`, accompanied by
`eslint-config-next@16.2.11` to keep framework and lint rules aligned.
Transitive `postcss` and `sharp` findings require a separate compatibility
decision because the current stable Next release still declares
`postcss@8.4.31` and `sharp@^0.34.5`.

The current Supabase changelog adds one deployment prerequisite: Supabase
JavaScript client libraries dropped Node.js 20 support on 2026-06-30. Vercel
Preview and Production must therefore use a supported Node.js 22-or-newer
runtime. The other current hosted Supabase breaking-change notices reviewed do
not alter this application's SSR client or OAuth flow.

Do not run `npm audit fix --force`. Its suggested ESLint resolution includes
major or invalid-looking package-family changes that must not be accepted
automatically.

## Reproduction

Commands run against the committed lockfile and current install:

```text
npm audit --json
npm audit fix --dry-run --json
npm ls next postcss sharp eslint eslint-config-next minimatch \
  brace-expansion @eslint/config-array @eslint/eslintrc \
  eslint-plugin-import eslint-plugin-jsx-a11y eslint-plugin-react --all
```

The dry run did not change `package.json`, `package-lock.json`, or
`node_modules`. It proposed patch updates including Next 16.2.11, but still
reported all 12 vulnerable package entries because the current dependency
families retain vulnerable transitive ranges.

## Exact dependency paths

| Audit entry | Installed path | Class | Deployed/reachable assessment |
|---|---|---|---|
| `next@16.2.10` | direct production dependency | Production | Deployed and reachable. Mansor One uses App Router, `proxy.ts`, Route Handlers, and standard Vercel Next runtime. The proxy-bypass and App Router denial-of-service advisories therefore require the 16.2.11 patch. Custom-server SSRF is not reachable because the repository has no custom Next server. Rewrite SSRF is not currently reachable because `next.config.ts` defines no rewrites, but the package must still be patched. |
| `next > postcss@8.4.31` | transitive from Next | Production package/build path | Present in the deployed dependency graph. Current application code does not process user-supplied CSS or source maps at request time, so the documented file-read/XSS preconditions were not found. It remains supply-chain/build exposure and should not be accepted permanently. |
| `next > sharp@0.34.5` | optional dependency from Next | Production runtime-capable | Installed and usable by the Next image optimizer. Repository search found no `next/image` import or `<Image>` component and no remote image configuration, materially reducing current reachability. The framework image endpoint still warrants preview probing before release. |
| `eslint@9.39.4` | direct dev dependency | Development/CI | Not bundled or executed by the deployed application. Exposure requires untrusted glob/pattern input to reach lint tooling. CI currently lints repository-controlled paths only. |
| `eslint > @eslint/config-array@0.21.2` | transitive dev dependency | Development/CI | Same ESLint-only reachability. Pull requests can influence repository filenames/configuration, so CI resource exhaustion remains possible and should be tracked. |
| `eslint > @eslint/eslintrc@3.3.5` | transitive dev dependency | Development/CI | Same ESLint-only reachability. |
| `eslint > minimatch@3.1.5` | transitive dev dependency | Development/CI | Vulnerable glob engine used by ESLint. No network request reaches it in production. |
| `eslint > minimatch > brace-expansion@1.1.16` | transitive dev dependency | Development/CI | Vulnerable expansion path; repository-controlled lint patterns only. |
| `eslint-config-next@16.2.9` | direct dev dependency | Development/CI | Not deployed. It introduces the three plugin paths below. It is also one patch behind the framework and should be aligned to 16.2.11. |
| `eslint-config-next > eslint-plugin-import@2.32.0 > minimatch@3.1.5` | transitive dev dependency | Development/CI | Not production-reachable. |
| `eslint-config-next > eslint-plugin-jsx-a11y@6.10.2 > minimatch@3.1.5` | transitive dev dependency | Development/CI | Not production-reachable. |
| `eslint-config-next > eslint-plugin-react@7.37.5 > minimatch@3.1.5` | transitive dev dependency | Development/CI | Not production-reachable. |

An additional patched path is available without a major upgrade:
`typescript-eslint > @typescript-eslint/typescript-estree >
minimatch@10.2.5 > brace-expansion@5.0.7` can move to
`brace-expansion@5.0.8`. This removes that instance, but it does not resolve
the older ESLint `minimatch@3.1.5` paths.

## Next advisory reachability

The `next` audit entry aggregates nine advisories:

| Advisory family | Mansor One reachability |
|---|---|
| App Router proxy/middleware bypass | Potentially reachable. The app uses `proxy.ts`; sensitive APIs also authenticate directly, which limits data exposure, but page guards and defense in depth still matter. |
| App Router Server Action denial of service | Potentially reachable. The repository contains Server Actions. |
| Custom-server Server Action SSRF | Not currently reachable; Vercel standard runtime is used and no custom server exists. |
| Attacker-controlled rewrite destination SSRF | Not currently reachable; no rewrites are configured. |
| Request-body cache confusion | Framework path is deployed; no application reliance on caching mutation responses was found. Patch rather than rely on non-reachability. |
| Edge Server Action unbounded payload | No Edge Server Action runtime declaration was found. |
| Image optimization SVG denial of service | Reduced reachability: no application `next/image` usage or remote image configuration found. Preview should still probe `/_next/image`. |
| Internal Server Function endpoint disclosure | Server Actions exist; patch required even though direct action authentication remains in place. |

## Smallest safe upgrade proposal

### Approval group A — required before preview approval

Patch-only, same framework minor:

```json
{
  "dependencies": {
    "next": "16.2.11"
  },
  "devDependencies": {
    "eslint-config-next": "16.2.11"
  }
}
```

Pin the exact versions in `package.json`, regenerate the lockfile with a normal
`npm install`, then run the complete validation suite and a new `npm audit`.
Do not use `npm audit fix`.

Expected effect:

- resolves the nine advisories whose vulnerable Next range ends before
  16.2.11;
- keeps the Next lint plugin aligned with the framework;
- does not by itself guarantee removal of the `postcss`, `sharp`, or ESLint
  family entries.

### Approval group B — safe dev-only patch refresh

Permit npm to select:

- `eslint@9.39.5`;
- `@eslint/eslintrc@3.3.6`;
- `@eslint/js@9.39.5`;
- `brace-expansion@5.0.8` on the minimatch 10 path;
- `postcss@8.5.23` on the Tailwind development path.

These are patch updates. They reduce stale instances but do not eliminate the
`minimatch@3` ESLint advisories.

### Approval group C — requires explicit compatibility review

Do not apply yet:

- an override from Next's `postcss@8.4.31` to `postcss@8.5.23`;
- an override from `sharp@0.34.5` to `sharp@0.35.3`;
- ESLint 10 or a global minimatch 10 override.

Reasons:

- Next 16.2.11 still declares the older PostCSS dependency;
- `sharp` is pre-1.0, so a minor upgrade may contain breaking API/runtime
  behavior;
- ESLint 10 is a major upgrade, and its compatibility with the current Next
  lint configuration must be validated;
- overriding `minimatch@3` with 10 changes a transitive dependency across major
  versions and is unsafe without upstream support.

If the nested PostCSS/Sharp issues remain after Approval group A, choose one of
these release decisions:

1. wait for a stable Next patch that updates the transitive packages; or
2. approve targeted overrides only after build, image endpoint, CSS pipeline,
   and Vercel preview validation.

## Release gate

Production approval requires:

1. Next is at least 16.2.11.
2. Vercel uses Node.js 22 or newer.
3. A fresh audit records the remaining exact findings.
4. Any remaining production dependency finding has either a tested patch or a
   written, time-bounded risk acceptance.
5. Development-only findings are tracked separately and do not get hidden with
   `audit-level` changes or suppressions.
6. Tests, TypeScript, ESLint, production build, and `git diff --check` pass
   after lockfile changes.
