# Mansor One Current State

Last updated: 2026-07-16

## Resumen ejecutivo

Mansor One esta en una etapa avanzada de fundacion: el Financial Engine existe,
Snapshot y Decision Engine v1 estan operativos, Robototina es el asistente
oficial, el Product Shell oscuro ya cubre las rutas financieras principales, y
hay herramientas internas para Data Health, duplicate resolution, category
conflicts y household contributions.

El producto todavia no esta listo para Production ni para IA generativa sobre
datos reales. Los bloqueadores principales son integridad de datos incompleta,
paginas legacy con queries directas, deuda visual interna en las paginas, y
decisiones pendientes de proveedores externos para Vercel, Google, Gmail y
Plaid.

## Que esta terminado

- Financial Engine centralizado bajo `lib/financial-engine`.
- Snapshot oficial en `lib/financial-engine/snapshot.ts`.
- Decision Engine v1 en `lib/financial-engine/decision-engine-v1.ts`.
- Robototina usando `getRobototinaContext()`.
- Robototina Q&A rules-based.
- Legacy Pablo API retirado con `410 Gone`.
- Product Shell v1 con `AppShell`, `PrimaryNav`, `PageHeader` y UI primitives.
- Duplicate Resolution reversible para ledger confirmado.
- Category Conflict review workflow.
- Vercel Security Gate para `/dev`, `/lab` y rutas Gmail diagnosticas.
- Documentos de deployment Vercel y rollback.
- Phase 1 Legacy Surface Containment: `/accounts`, `/quick-entry`,
  `/payment-instances` e `/imports` ya no leen Supabase desde Client
  Components.

## Que esta funcional pero incompleto

- Dashboard: consume engine outputs, pero todavia calcula view models y
  agregaciones de presentacion grandes dentro de `app/page.tsx`.
- Spending/History: consumen `getLedgerSummary`, pero resuelven categorias y
  totales de periodo en pagina.
- Planning: usa helpers de management, pero conserva labels/copy legacy y
  calculos de resumen en pagina.
- Income: tiene helper oficial, pero la UI y el modelo aun necesitan limpieza.
- Plaid: link token, exchange, sync accounts y sync imports existen; faltan
  webhook, retries robustos, stable callback strategy y observabilidad.
- Gmail/ATH: rutas diagnosticas y parsing existen; falta operacionalizar
  import, dedupe/reconciliation completa y estrategia Vercel.
- Debt Strategy v1: produce insights, pero depende de datos incompletos
  como APR, due date, minimum payment y ownership.
- Data Health Inspector: cubre muchas tablas y health checks, pero aun no
  reemplaza una validacion viva de datos con usuario autenticado.

## Que quedo a mitad

- Product Shell: shell completado; contenido interno de varias paginas sigue
  visualmente legacy.
- Project Phoenix: migraciones y scripts existen, pero quedan paginas legacy
  como `/payments`, `/cashflow`, `/future-obligations`.
- Goal engine: docs y helper existen. `/goals` ya no usa Supabase desde el
  cliente; queda como superficie legacy servida por helper/server actions.
- Transfer ledger: detectado como necesidad, no implementado como contrato
  oficial.
- Atlas: documentado como direccion futura, no implementado.
- MCP/Automations: documentado como futuro, no implementado.

## Que no se ha iniciado

- Robototina AI v1 con OpenAI.
- Atlas v1 simulation engine.
- MCP tools/automations.
- Webhooks Plaid production-ready.
- Cron/scheduled sync jobs.
- Test suite automatizada propia.
- Extraccion de `packages/financial-engine`.

## Que esta obsoleto

- `/advisor`, `/advisor-v2`, `/pablo-chat` son legacy/compatibility.
- `/api/pablo/answer` esta retirado y responde `410 Gone`.
- `lib/pablo/*` no aparece como activo en el inventario actual.
- Paginas antiguas como `/priorities`, `/cashflow`, `/payments`,
  `/payment-instances`, `/accounts`, `/quick-entry` e `/imports` deben
  tratarse como legacy hasta migracion completa de producto. Las cuatro rutas
  contenidas en Phase 1 ya no tienen acceso directo a Supabase desde cliente.
- `/goals` y `/merchant-rules` siguen siendo legacy funcionales, pero ya pasan
  por server boundary en lugar de cliente Supabase directo.

## Riesgos actuales

- Lint global pasa desde Phase 0.
- `scripts/check-legacy-advisor-usage.mjs` pasa desde Phase 0 y ya ignora
  menciones historicas validas en docs.
- `/goals` lee/escribe `financial_goals` desde server helper/actions; ya no
  evade la arquitectura desde Client Component.
- Varias paginas legacy consultan tablas directas. Las rutas `/accounts`,
  `/quick-entry`, `/payment-instances` e `/imports` quedaron contenidas detras
  de server boundary/helper, pero siguen siendo legacy de producto.
- Service role se usa en rutas server; parece server-only, pero requiere
  vigilancia estricta.
- `.env.local` existe localmente; no se imprimio ningun secreto.
- Hay archivos vacios accidentales en raiz: `1`, `Build`, `next`,
  `mansor-one@0.1.0`.
- No hay tests propios detectados fuera de `node_modules` y `.next`.

## Dependencias

- Supabase Auth, RLS y cookies SSR.
- Plaid API y token encryption.
- Google OAuth/Gmail refresh token.
- Financial Engine contracts.
- Vercel environment variables and provider callback setup.

## Estado por area

| Area | Estado | Evidencia |
| --- | --- | --- |
| Core Engine | Functional but incomplete | `lib/financial-engine/*`, `snapshot.ts`, `decision-engine-v1.ts` |
| Data | Partial | Data Health exists; missing live authenticated readback in this audit |
| Plaid | Functional but incomplete | `app/api/plaid/*`, `lib/plaid/*`, no webhook route found |
| Gmail | Partial | `app/api/gmail/*`, diagnostic guards present |
| ATH | Partial | Gmail ATH parser/import exist; reconciliation still incomplete |
| Cards | Functional but incomplete | `cards.ts`, `CardsClient`, missing APR/due metadata warnings |
| Income | Partial | `income.ts`, `income-management.ts`, UI still management-heavy |
| Planning | Partial | `planning.ts`, `planning-management.ts`, UI still internal-like |
| Robototina | Functional v1 | `robototina-context.ts`, `robototina-qa.ts`, `/robototina` |
| UX | Shell complete, content partial | `docs/ux/product-shell-v1.md`, migrated main pages |
| Security | Improved, not production complete | internal tool guard passes; service role and legacy routes remain |
| Deployment | Preview near-ready | Vercel docs and build pass; provider setup pending |
| AI | Not started | AI playbook exists; no OpenAI route implemented |
| MCP | Not started | only future docs/requirements found |

## Proximo sprint recomendado

Product Polish and Legacy Surface Containment.

## Que no debemos hacer todavia

- No implementar OpenAI.
- No implementar Atlas.
- No implementar MCP.
- No hacer Production deploy.
- No automatizar pagos o Gmail imports.
- No borrar legacy sin checkpoint y migracion documentada.
- No usar service role para saltarse problemas de ownership/RLS.
