# Legacy Advisor Retirement

Status: Phase 3 complete

Robototina is the official Mansor One financial advisor surface. New advisor
features must follow this path:

Financial Engine Snapshot -> Decision Engine v1 -> getRobototinaContext() -> React

## Current Behavior

- `/advisor` is a compatibility route that redirects to `/robototina`.
- Existing query parameters are preserved when redirecting.
- `/pablo-chat` permanently redirects to `/robototina`.
- `/api/pablo/answer` returns `410 Gone` with `/api/robototina/answer` as the
  canonical replacement.
- Decision Engine v1 is the official recommendation source.
- Robototina Q&A is the official assistant Q&A path.
- The Pablo library and Decision Engine v0 module have been deleted.

## Compatibility Still Present

- `app/advisor/page.tsx` redirects old advisor bookmarks.
- `app/pablo-chat/page.tsx` redirects old chat bookmarks.
- `app/api/pablo/answer/route.ts` returns a retired API response.

## Architecture Rule

React pages present data. They must not rebuild financial advisor logic, query
raw financial tables for advisor decisions, or calculate recommendations.

New financial advisor features must consume:

- `getFinancialEngineSnapshot()`
- Decision Engine v1 decisions
- `getRobototinaContext()`
- `answerRobototinaQuestion()` for rules-based advisor Q&A

## Phase 3 Result

- No active `lib/pablo/*` imports remain.
- `lib/pablo/*` has been deleted.
- `getDecisionEngineResult()` and the v0 `decisionEngineResult` snapshot field
  have been removed.
- Decision Engine v1 is the only official recommendation engine.
- Robototina Q&A uses Robototina context only and does not query raw financial
  tables.
