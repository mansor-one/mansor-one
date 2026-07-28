# Security Phase 1.6 Audit Comparison

Date: 2026-07-24

## Summary

| npm audit result | Before | After |
| --- | ---: | ---: |
| Critical | 0 | 0 |
| High package entries | 12 | 12 |
| Moderate | 0 | 0 |
| Low | 0 | 0 |
| Total dependency records | 455 | 455 |

The unchanged aggregate count is not evidence that the patch had no security
effect. Before the patch, the direct `next` entry included nine Next.js
framework advisories (four high and five moderate). After 16.2.11, those nine
framework advisories are absent. The `next` entry remains high only because npm
propagates the unresolved transitive PostCSS and Sharp findings.

## Remaining production graph

- `next -> postcss@8.4.31`: three advisories, including arbitrary file-read and
  path-traversal/source-map issues. The top-level Tailwind build chain also has
  `postcss@8.5.15`.
- `next -> sharp@0.34.5`: inherited libvips vulnerabilities.
- npm's suggested `next@9.3.3` remediation is an invalid downgrade for this
  application and must not be applied.

These findings are unresolved, not suppressed. See
`SECURITY_PHASE1_6_POSTCSS_SHARP_REVIEW.md`.

## Remaining development and CI graph

Nine high package entries remain:

1. `@eslint/config-array`
2. `@eslint/eslintrc`
3. `brace-expansion`
4. `eslint`
5. `eslint-config-next`
6. `eslint-plugin-import`
7. `eslint-plugin-jsx-a11y`
8. `eslint-plugin-react`
9. `minimatch`

They converge on `brace-expansion`/`minimatch` denial-of-service behavior in the
lint toolchain. They are development dependencies and are not shipped in the
Next.js runtime bundle. They can still affect CI that lints attacker-controlled
paths or configuration, especially untrusted pull requests.

No GitHub Actions workflow currently exists in the repository. A future workflow
should use Node 22, least-privilege permissions, no production secrets for
untrusted forks, bounded jobs, and dependency monitoring.

The audit proposes ESLint 10 for much of this graph. That is a breaking major and
is explicitly outside Phase 1.6. The safe future resolution is a coordinated,
tested ESLint 10 plus compatible Next ESLint configuration upgrade—not package
overrides. Dependabot or Renovate should monitor the chain in the meantime.

## Interpretation

- Resolved: the nine direct Next.js framework advisories covered by 16.2.11.
- Unresolved: PostCSS, Sharp, and the nine lint-tool package entries.
- No `npm audit fix`, forced fix, suppression, or incompatible override was used.
