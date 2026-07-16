# Git Checkpoint Recommendation

Last updated: 2026-07-16

## Current state

Latest commit:

```text
f49fb9a security(deployment): gate internal routes and prepare Vercel preview
```

The worktree is dirty with:

- Product Shell / dark UI changes.
- Newly added app components.
- Prior untracked Data Health and Household Contribution work.
- Phase 0 lint and legacy guard fixes.
- `/goals` server boundary migration.
- Deployment docs changes.
- Financial Engine export changes.
- New project audit docs.
- Tracked accidental root files: `1`, `Build`, `next`, `mansor-one@0.1.0`.

## Risk

There is enough uncommitted work that continuing without a checkpoint risks
mixing unrelated product, data-health, deployment, Phase 0 fixes and
documentation changes.

## Git hygiene classification

| Path | Classification | Reason |
| --- | --- | --- |
| `app/components/AppShell.tsx` | Keep and commit | Product Shell foundation |
| `app/components/PageHeader.tsx` | Keep and commit | Product Shell foundation |
| `app/components/PrimaryNav.tsx` | Keep and commit | Product Shell navigation |
| `app/components/ui-primitives.tsx` | Keep and commit | Shared UI primitives |
| `app/goals/actions.ts` | Keep and commit | Removes client-side financial writes |
| `app/goals/GoalCard.tsx` | Keep and commit | Client-only edit state/forms |
| `app/merchant-rules/actions.ts` | Keep and commit | Lint/server boundary cleanup |
| `app/merchant-rules/RuleCard.tsx` | Keep and commit | Client-only input state/forms |
| `docs/project/*` | Keep and commit | Phase 0 audit/checkpoint docs |
| `docs/ux/product-shell-v1.md` | Keep and commit | Product Shell documentation |
| `app/dev/data-health/*` | Keep and commit | Prior legitimate Data Health work |
| `lib/financial-engine/data-health.ts` | Keep and commit | Prior legitimate Data Health work |
| `app/dev/household-contributions/*` | Keep and commit | Prior legitimate Household Planner work |
| `lib/financial-engine/household-contributions.ts` | Keep and commit | Prior legitimate Household Planner work |
| `docs/architecture/household-contribution-planner.md` | Keep and commit | Prior legitimate architecture doc |
| `docs/deployment/vercel-private-preview-plan.md` | Keep and commit | Prior legitimate deployment doc |
| `.env.local` | Do not commit | Secret/local env, ignored |
| `.next/` | Do not commit | Build output, ignored |
| `node_modules/` | Do not commit | Dependencies, ignored |
| `next-env.d.ts` | Do not commit | Generated, ignored |
| `tsconfig.tsbuildinfo` | Do not commit | Generated, ignored |
| `1` | Remove with approval | Tracked zero-byte accidental file |
| `Build` | Remove with approval | Tracked zero-byte accidental file |
| `next` | Remove with approval | Tracked zero-byte accidental file |
| `mansor-one@0.1.0` | Remove with approval | Tracked zero-byte accidental file |

## Recommended checkpoint name

Tag candidate after commit:

```text
v0.9-product-foundation
```

Commit message candidate:

```text
docs(project): audit current state and product foundation
```

If Product Shell code and audit docs should be separate commits, use:

```text
feat(ux): add product shell dark dashboard foundation
docs(project): add current-state audit and roadmap
```

## Commands to run after approval

Review first:

```bash
git status --short
git diff --stat
git diff --check
npm run build
npx tsc --noEmit
npm run lint
```

Clean accidental tracked files only after approval:

```bash
rm 1 Build next mansor-one@0.1.0
```

Stage intentionally:

```bash
git add app/api/plaid/create-link-token/route.ts app/ath-movil/page.tsx app/cards/page.tsx app/components app/globals.css app/goals app/history/page.tsx app/imports/page.tsx app/income/page.tsx app/layout.tsx app/merchant-rules app/page.tsx app/plaid/page.tsx app/planning/page.tsx app/portfolio/page.tsx app/priorities/page.tsx app/robototina/page.tsx app/spending/page.tsx app/timeline/page.tsx lib/finance/reconcileMovement.ts lib/financial-engine/goals.ts lib/financial-engine/index.ts scripts/check-legacy-advisor-usage.mjs docs/README.md docs/project docs/ux/product-shell-v1.md docs/deployment/vercel-readiness.md docs/deployment/vercel-private-preview-plan.md docs/architecture/household-contribution-planner.md app/dev/data-health app/dev/household-contributions lib/financial-engine/data-health.ts lib/financial-engine/household-contributions.ts
git status --short
```

Commit:

```bash
git commit -m "chore: establish Mansor One product foundation checkpoint"
```

Annotated tag after validation:

```bash
git tag -a v0.9-product-foundation -m "Mansor One product foundation checkpoint"
```

Do not push or tag without explicit approval.
