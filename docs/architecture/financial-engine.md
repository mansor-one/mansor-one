# Financial Engine

Last updated: 2026-07-02

## Proposito

El Financial Engine concentra calculos financieros para que las paginas sean capas de presentacion. Recibe un cliente Supabase server-side y `userId`.

No debe contener UI, React, Tailwind, componentes cliente ni mutaciones de datos salvo que una responsabilidad futura lo justifique explicitamente.

El estado financiero compartido debe fluir por engines o helpers de dominio. Dashboard, Cards, Spending, History, Timeline, Planning y Robototina no deben mantener modelos paralelos para lifecycle, categorias, merchant learning, owner context o reconciliacion.

## Modulos Actuales

- `accounts.ts`: lee cuentas conectadas, cuentas manuales y tarjetas manuales.
- `account-resolver.ts`: resuelve duplicados de Plaid sin modificar registros.
- `assets.ts`: construye assets conectados y manuales.
- `categories.ts`: define el registro canonico de categorias de sistema.
- `merchant-knowledge.ts`: normaliza merchants y calcula confianza de significado financiero aprendido.
- `goals.ts`: modela metas financieras read-only con balances derivados de funding ledger.
- `portfolio.ts`: calcula Portfolio Summary.
- `liquidity.ts`: calcula Liquidity Summary.
- `planning.ts`: calcula Planning Summary.
- `dashboard.ts`: compone Dashboard Summary.
- `categorizeTransaction.ts`: base para categorizacion futura.
- `ledger-summary.ts`: une imports Plaid y ledger confirmado en una vista normalizada.
- `review-queue.ts`: clasifica candidatos de revision desde Ledger Summary y contexto de pagos.
- `ledger-promotion.ts`: promociona imports Plaid a `quick_entries` de forma idempotente.
- `cards.ts`: construye vista unificada de tarjetas manuales, Plaid y calendarios.

## Capas Futuras

- Financial Summary: interpreta Portfolio, Liquidity y Planning.
- Decision Engine: convierte interpretaciones en decisiones priorizadas.
- Merchant Knowledge Engine: alimentara Transaction Intelligence con memoria de merchants, estabilidad y confianza.
- Financial Events / Windfall Planner: modelara ingresos extraordinarios esperados para escenarios, sin contarlos como cash actual.
- Debt Engine: comparara estrategias de deuda como pagos grandes, balance transfers, consolidacion, cancelacion de tarjetas y preservacion de cash.
- Household Engine: modelara owner labels, miembros, shared accounts y visibilidad Manuel/Soraya.

## Account Resolver

La cuenta Plaid no es la identidad financiera final. El resolver agrupa por institucion, nombre, tipo y subtipo, conserva el balance mas reciente y reporta duplicados.

## Assets Engine

Convierte cuentas conectadas y manuales en un modelo comun:

- `source`: `plaid` o `manual`
- `balance`
- `availableBalance`
- `isLiquid`
- `isCredit`
- `isManual`
- `isConnected`

## Portfolio Summary

Calcula:

- balance total de assets no crediticios
- liquidez disponible
- liquidez conectada y manual
- deuda y credito disponible
- conteos de assets
- net worth
- utilizacion de credito

## Liquidity Summary

Calcula:

- efectivo Plaid y manual
- pagos pendientes
- ingresos confirmados
- resultado antes y despues de ingresos
- deuda y credito conectado
- deuda y pagos minimos de tarjetas manuales

## Planning Summary

Lee `planning_items` activos y calcula obligaciones futuras visibles para el Dashboard.

Planning v2 debe separar obligaciones recurrentes de proveedores actuales. Servicios del hogar, como recorte de grama o fumigacion, deben preservar pagos historicos aunque cambie el vendor.

## Goal Engine

Modela metas como objetivos financieros, no como obligaciones. El balance de
cada meta se deriva de un funding ledger; no se debe almacenar ni editar
`currentBalance` como verdad. En v1 provee tipos, progreso, health, confianza,
estimacion de completion y orden por prioridad sin leer ni escribir base de
datos.

## Paginas Migradas

- Dashboard: usa `getDashboardSummary()` y `getPortfolioSummary()`.
- Health Score: usa Portfolio Summary.
- Timeline: usa Portfolio Summary para dinero inicial.
- Cards: usa Liquidity Summary para tarjetas manuales.

## Paginas Revisadas No Migradas

- Cashflow: mantiene logica legacy de `scheduled_payments`.
- Accounts: combina lectura, edicion manual y sync Plaid; requiere rediseño.
- Plaid: es una pagina de integracion, no debe depender del Financial Engine.
