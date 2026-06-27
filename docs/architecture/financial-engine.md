# Financial Engine

Last updated: 2026-06-26

## Proposito

El Financial Engine concentra calculos financieros para que las paginas sean capas de presentacion. Recibe un cliente Supabase server-side y `userId`.

No debe contener UI, React, Tailwind, componentes cliente ni mutaciones de datos salvo que una responsabilidad futura lo justifique explicitamente.

## Modulos Actuales

- `accounts.ts`: lee cuentas conectadas, cuentas manuales y tarjetas manuales.
- `account-resolver.ts`: resuelve duplicados de Plaid sin modificar registros.
- `assets.ts`: construye assets conectados y manuales.
- `portfolio.ts`: calcula Portfolio Summary.
- `liquidity.ts`: calcula Liquidity Summary.
- `planning.ts`: calcula Planning Summary.
- `dashboard.ts`: compone Dashboard Summary.
- `categorizeTransaction.ts`: base para categorizacion futura.

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

## Paginas Migradas

- Dashboard: usa `getDashboardSummary()` y `getPortfolioSummary()`.
- Health Score: usa Portfolio Summary.
- Timeline: usa Portfolio Summary para dinero inicial.
- Cards: usa Liquidity Summary para tarjetas manuales.

## Paginas Revisadas No Migradas

- Cashflow: mantiene logica legacy de `scheduled_payments`.
- Accounts: combina lectura, edicion manual y sync Plaid; requiere rediseño.
- Plaid: es una pagina de integracion, no debe depender del Financial Engine.
