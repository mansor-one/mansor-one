# Security Phase 1.6 PostCSS and Sharp Review

Date: 2026-07-24
Decision: document and test; do not override yet

## PostCSS

Installed chains:

- `next@16.2.11 -> postcss@8.4.31` (Next exact dependency).
- `@tailwindcss/postcss@4.3.0 -> postcss@8.5.15`.

Both are within npm's affected `<=8.5.17` range. The fixed line begins at
8.5.18. The advisories cover unescaped CSS output, attacker-controlled
`sourceMappingURL` file reads, and previous-source-map path traversal.

Mansor One uses PostCSS/Tailwind during compilation. No feature that accepts and
processes user-supplied CSS or source maps was found, so direct production
request reachability is likely absent. The affected code is nevertheless present
in installs and relevant to build/CI trust boundaries; an untrusted source
change could target the build processor.

Classification: **build-time risk; likely non-reachable in production requests
but present**.

Next 16.2.11 did not change its PostCSS version. An override to 8.5.18+ would
exceed Next's exact declared dependency and is not established as officially
compatible. No override was applied.

Focused future validation:

1. Apply a candidate only on a dedicated branch.
2. Compile all global CSS and Tailwind styles in dev and production.
3. Exercise Fast Refresh and CSS source maps.
4. Test malformed and path-like `sourceMappingURL` comments in isolated fixtures.
5. Compare generated CSS, bundle size, and visual regressions.

## Sharp

Installed chain:

- `next@16.2.11 -> sharp@0.34.5` (optional dependency range `^0.34.5`).

The npm advisory affects versions below 0.35.0 through inherited libvips
vulnerabilities. The fixed major-minor line begins at 0.35.0.

Sharp is runtime-capable through Next's image optimizer, and the deployed server
install contains it. No `next/image`, remote image pattern, or application image
optimization usage was found in the repository. The generic image optimization
surface may still exist in Next, so absence of imports is not enough to call the
package removed or the advisory resolved.

Classification: **likely non-reachable but present; insufficient evidence to
declare zero runtime exposure**.

Next 16.2.11 did not upgrade Sharp. Because semver `^0.34.5` excludes 0.35.x, a
0.35 override is outside Next's declared compatible range. No override was
applied.

Focused future validation:

1. Confirm whether Vercel invokes Sharp for any production route.
2. Test valid local images, remote URL denial, SVG behavior, malformed inputs,
   oversized images, formats, caching, memory, and latency.
3. Verify Next build/start and Vercel Preview on a dedicated Sharp 0.35.x branch.
4. Prefer an upstream Next release that officially accepts the fixed Sharp line.

## Recommendation

Monitor Next release notes and dependency updates. Treat both findings as open.
Do not accept npm's suggested Next downgrade and do not introduce overrides
without the focused compatibility suite.
