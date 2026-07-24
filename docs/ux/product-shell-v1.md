# Product Shell v1

## Purpose

Product Shell v1 gives Mansor One a shared family-finance frame without moving
financial logic into React. The visual standard is a dark executive dashboard:
left navigation on desktop, compact mobile navigation, translucent cards, calm
severity color and whitespace-first financial summaries.

The shell is presentation only:

- Financial Engine calculates.
- Robototina explains.
- React presents.

## Components

- `AppShell`: dark product canvas, consistent page width, background, spacing,
  primary navigation and optional page header.
- `PrimaryNav`: Spanish-first household sidebar, active route state, desktop
  links, mobile menu and internal-tool separation.
- `PageHeader`: page title, subtitle, optional eyebrow, breadcrumb, back link,
  actions and status badge.
- `KpiCard`: compact metric card for executive summaries.
- `StatusBadge`: soft status/severity label.
- `InlineNotice`: consistent success, warning, info and critical messages.
- `EmptyState`: calm empty state with optional action.
- `PageActions`: simple action grouping.
- `LoadingSkeleton`: lightweight loading placeholder.

## Household Navigation

Primary household navigation:

| Label | Route | Purpose |
| --- | --- | --- |
| Inicio | `/` | Family dashboard |
| Robototina | `/robototina` | Advisor briefing |
| Gastos | `/spending` | Confirmed spending |
| Movimientos | `/history` | Confirmed ledger history |
| Pagos | `/timeline` | Payment and cash timing |
| Tarjetas | `/cards` | Credit cards |
| Patrimonio | `/portfolio` | Cash, assets, debt and net worth |
| Metas | `/planning` | Planning funds |
| Bancos | `/plaid` | Connected banks |

The primary navigation must not link to `/dev/*`, fixture pages, engine
inspectors, duplicate-resolution tools, category conflict tools or Data Health.

## Internal Navigation

Internal tools remain visually separate and appear only when the current route is
under `/dev` or `/lab`.

Initial internal links:

- Financial Inbox: `/lab/review-queue`
- Data Health: `/dev/data-health`
- Plan Familiar beta: `/dev/household-contributions`
- Duplicates: `/dev/confirmed-ledger-duplicates`
- Categories: `/dev/category-conflicts`
- Lab: `/lab`

Access is still enforced by the existing server/proxy gates. Hiding links is not
a security boundary.

## Spanish-First Copy Rule

Household-facing UI should be Spanish-first. English terms should remain only
when they are product names or provider terms, such as Plaid, Robototina or
Mansor One.

Preferred copy:

- confirmed -> confirmado
- pending review -> pendiente por revisar
- spending -> gastos
- history -> movimientos
- portfolio -> patrimonio
- timeline -> pagos or calendario
- sync -> actualizar or sincronizar

Developer terms such as engine, validation, fixture, diagnostic, raw, source row
and inspector belong only in internal surfaces.

## Mobile Behavior

`PrimaryNav` shows a compact mobile header and a menu button on small screens.
Desktop keeps the navigation visible as a fixed left-side product sidebar.
Active route state uses `aria-current="page"`.

Future versions may replace the mobile menu with a bottom navigation if daily
mobile use proves more important than dense desktop management.

## Pilot Pages Migrated

Phase 1 migrated the shell only for:

- `/`
- `/robototina`
- `/spending`
- `/history`
- `/portfolio`
- `/timeline`

The internal content of those pages was intentionally preserved. Follow-up work
should redesign one workflow at a time.

## Plan Familiar

`/dev/household-contributions` remains internal and protected. Its future product
name should be either:

- Plan Familiar
- Plan de Quincena

Before promotion, the page needs product copy, clearer required-vs-optional
contribution separation and a stronger explanation of transfer recommendations.

## Migration Order

Recommended next UI migrations:

1. Plaid Sync UX v1.
2. Spending polish.
3. Timeline cash-outlook polish.
4. Review Queue to Financial Inbox.
5. Planning form hierarchy.
6. Cards diagnostics cleanup.
7. Household Planner productization.

Each migration should preserve Financial Engine boundaries and avoid moving
calculations into React.
