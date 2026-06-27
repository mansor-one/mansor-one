# Documentacion de Mansor One

Last updated: 2026-06-26

Esta carpeta documenta las decisiones actuales de producto y arquitectura.

## Secciones

- `architecture/domain-language.md`: vocabulario compartido del dominio financiero.
- `architecture/financial-engine.md`: responsabilidades y modulos del Financial Engine.
- `architecture/sprint-log.md`: progreso de Sprint 1 y Sprint 2.
- `architecture/architecture-decisions.md`: ADRs vigentes.

## Sprint Review

Sprint 1 establecio la base de integracion financiera: Plaid, cuentas conectadas, importaciones, dashboard inicial y primeras reglas de seguridad.

Sprint 2 esta consolidando el Financial Engine como fuente de calculos. El Dashboard, Health Score, Timeline y Cards ya comenzaron a consumir datos desde el motor. Cashflow, Accounts y Plaid fueron revisadas y clasificadas para migraciones futuras mas seguras.
