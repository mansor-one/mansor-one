# Security Phase 1.5 — Rate-Limiting Plan

Date: 2026-07-24
Status: proposal only; no limiter implemented.

## Decision

Do not use process memory, a module-level `Map`, or a database table queried
non-atomically. Vercel functions are concurrent and ephemeral, so those
approaches allow bypasses and inconsistent limits.

The recommended implementation is a managed Redis-compatible store with:

- separate Preview and Production instances/namespaces;
- atomic sliding-window or token-bucket operations;
- automatic TTL on every key;
- encryption in transit and credentials stored server-side;
- regional placement aligned with the Vercel functions;
- bounded request timeout and documented outage behavior;
- no raw email, user ID, household ID, IP, Plaid ID, or financial identifier in
  keys.

Before implementation, approve the provider, retention, cost, region, and
failure behavior.

## Key construction and privacy

Create a server-only HMAC key from a rate-limit secret:

```text
rl:v1:<environment>:<policy>:HMAC(secret, subject)
```

Preferred subjects:

1. authenticated user ID plus household ID for household operations;
2. household ID for shared integration cost controls;
3. trusted client IP only for anonymous/login-sensitive traffic;
4. endpoint family, not unbounded attacker-controlled path text.

Never return the key or remaining internal identifiers. Responses may include
standard aggregate headers:

- `Retry-After`;
- `RateLimit-Limit`;
- `RateLimit-Remaining`;
- `RateLimit-Reset`.

Logs should contain a generated request/correlation ID, policy name, outcome,
and coarse subject type—not email addresses, tokens, message bodies, bank
identifiers, or raw IPs.

## Trusted proxy handling

On Vercel, obtain the client address only from the platform-supported request
property/header after confirming Vercel overwrites or sanitizes it. Do not
trust an arbitrary `X-Forwarded-For` supplied directly by a client and do not
select the leftmost value without a documented proxy chain.

Rules:

- authenticated endpoints primarily limit by authenticated user/household,
  not IP;
- anonymous limits use the verified Vercel client IP plus a coarse global
  safeguard;
- local development may use loopback but must not weaken Preview/Production;
- if the trusted address is unavailable, use a stricter anonymous/global
  bucket instead of a client-provided identity;
- document the exact Vercel header/property from current platform
  documentation immediately before implementation.

## Proposed initial policies

Values are conservative starting points and require Preview load/UX testing.

| Surface | Subject | Burst/window | Sustained limit | Failure behavior |
|---|---|---:|---:|---|
| Supabase password login/signup | Supabase project controls plus trusted IP | Use Supabase Auth configured limits and CAPTCHA; current login calls Supabase directly from the browser. | Provider-controlled | Fail closed at provider. Do not proxy credentials solely to add an application limiter without separate design approval. |
| `GET /api/auth/google/start` | user + household, plus trusted IP | 5 per 10 minutes | 20 per 24 hours | Fail closed with 429. Do not create state or redirect when denied. |
| Google OAuth callback | user + state outcome | 10 per 10 minutes | 50 per 24 hours | Preserve state validation first or in tandem; never consume valid state because the rate store is unavailable without a documented retry path. Provider error storms receive 429. |
| `POST /api/gmail/ath-import` | household and user | 3 per 5 minutes | 20 per 24 hours per household | Fail closed on limiter outage after a short timeout; imports are expensive and retryable. Return Spanish generic 429. |
| Gmail diagnostics | user + household | 10 per 10 minutes | 50 per 24 hours | Fail closed; diagnostics are non-essential. |
| Plaid create/update Link token | user + household | 5 per 10 minutes | 25 per 24 hours | Fail closed; no Plaid call when denied. |
| Plaid public-token exchange/revoke | user + household | 5 per 10 minutes | 25 per 24 hours | Fail closed. Preserve idempotency and never leak provider errors. |
| Plaid manual sync/repair completion | household plus connection ID HMAC | 2 per 5 minutes | 12 per hour, 40 per 24 hours | Fail closed; an active sync lock remains the concurrency authority. 429 must not mark a run failed or update successful-sync metadata. |
| Plaid daily cron | deployment/global plus household | one invocation per schedule; existing per-user daily/idempotent run keys | configured daily window | Exact cron secret first. On store outage, existing database run lock/daily-window controls remain authoritative; alert and stop rather than fan out duplicate runs. |
| Expensive financial mutations (duplicate resolution, reconciliation, payment confirmation, Review Queue import) | user + household + route family | 10 per minute | 100 per hour | Prefer fail closed for reconciliation/import operations. Ordinary single-row edits may fail open only under the explicit degraded-mode rule below. |
| Lower-cost authenticated CRUD | user + household | 30 per minute | 300 per hour | Fail open for a maximum short outage only if direct auth, authorization, Origin checks, validation, and database constraints all pass; emit an alert. |
| Read-only Robototina/financial context | user + household | 20 per minute | 200 per hour | Fail closed if computation/provider cost is material; otherwise serve cached/current deterministic context under an approved policy. |

Limits should be configurable server-side, but configuration must have minimum
safe bounds so an accidental zero/unlimited value cannot disable protection.

## Order of enforcement

For sensitive mutations:

1. reject invalid Origin/CSRF proof;
2. validate session;
3. derive authorized household/entity server-side;
4. apply subject-specific rate limit;
5. validate request body;
6. perform the idempotent operation.

For OAuth start, authenticate/authorize before creating state, then rate limit
before contacting Google. For anonymous login, rely first on Supabase Auth
limits/CAPTCHA because credentials currently go directly to Supabase.

This order prevents attackers from selecting another `user_id`,
`household_id`, or connection ID to consume another person's quota.

## Storage failure and abuse behavior

Default:

- timeout the store call quickly;
- OAuth starts, Gmail, Plaid, diagnostics, imports, and reconciliation fail
  closed with 503 if the limiter cannot make a decision;
- a confirmed over-limit request returns 429 with `Retry-After`;
- do not turn a limiter outage into a financial success/failure event;
- do not retry provider calls automatically after a limit decision;
- alert on store errors, unusual denial volume, and global fallback use.

Narrow degraded mode:

- low-cost, authenticated, household-authorized single-row edits may fail open
  briefly if explicitly approved;
- Origin validation, authorization, schema validation, idempotency, and
  database constraints remain mandatory;
- degraded mode must have a time limit and kill switch;
- no Gmail, Plaid, OAuth, import, bulk, reconciliation, document, or diagnostic
  operation may use fail-open behavior.

## Interaction with existing controls

Rate limiting supplements but does not replace:

- Supabase Auth provider limits and leaked-password protection;
- authenticated session validation;
- household/entity authorization and RLS;
- Origin/CSRF validation;
- signed one-time OAuth state;
- Plaid sync locks and daily-window uniqueness;
- stable source identifiers and idempotent upserts;
- request-body size limits;
- provider-side quotas.

## Implementation phases requiring approval

1. Select storage/provider and document data processing/retention.
2. Verify the trusted Vercel client-address mechanism.
3. Add a server-only limiter library with unit tests and no endpoint wiring.
4. Instrument report-only metrics in Preview without logging sensitive
   subjects.
5. Enforce OAuth start, Gmail import, and Plaid sync first.
6. Validate 429/503 UX and provider idempotency.
7. Expand to expensive financial mutations route by route.
8. Re-run authorization, CSRF, concurrency, and end-to-end tests before
   Production approval.

No broad middleware limiter should be introduced: route-specific identity,
cost, idempotency, and failure semantics are required.
