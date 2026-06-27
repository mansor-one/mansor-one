# Mansor One

Last updated: 2026-06-26

Mansor One es un sistema financiero personal para convertir cuentas, pagos, ingresos, tarjetas y transacciones en una vista clara de liquidez, deuda, obligaciones y decisiones.

El producto esta evolucionando hacia una arquitectura donde la UI presenta resultados y el Financial Engine concentra los calculos financieros.

## Vision

- Mostrar dinero disponible real.
- Separar liquidez, deuda, credito y planificacion.
- Integrar bancos conectados por Plaid sin duplicar cuentas.
- Mantener cuentas manuales cuando aportan contexto operativo.
- Preparar a Robototina, el asistente financiero, para explicar decisiones con datos confiables.

## Estado Actual

- Dashboard migrado a `getDashboardSummary()` y `getPortfolioSummary()`.
- Health Score usa Portfolio Summary para liquidez y deuda.
- Timeline usa Portfolio Summary para dinero inicial disponible.
- Cards usa Liquidity Summary para tarjetas manuales.
- Cashflow fue revisado, pero no migrado porque usa reglas legacy de `scheduled_payments`.
- Accounts fue revisado, pero no migrado porque combina lectura, edicion manual y sync de Plaid.
- Plaid fue clasificado como pagina de integracion, no como pagina financiera.

## Documentacion

- [Indice de documentacion](docs/README.md)
- [Lenguaje de dominio](docs/architecture/domain-language.md)
- [Financial Engine](docs/architecture/financial-engine.md)
- [Sprint Log](docs/architecture/sprint-log.md)
- [Architecture Decisions](docs/architecture/architecture-decisions.md)

## Desarrollo

Este proyecto usa Next.js App Router y Supabase. Para cambios de producto financiero, primero revisar si el calculo pertenece al Financial Engine antes de duplicarlo en una pagina.
