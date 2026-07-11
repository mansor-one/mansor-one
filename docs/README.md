# Documentacion de Mansor One

Last updated: 2026-06-26

Esta carpeta documenta las decisiones actuales de producto y arquitectura.

## Secciones

- `architecture/domain-language.md`: vocabulario compartido del dominio financiero.
- `architecture/category-system.md`: categorias canonicas y migracion futura desde texto libre.
- `architecture/financial-engine.md`: responsabilidades y modulos del Financial Engine.
- `architecture/goal-engine.md`: metas financieras con balances derivados de ledger.
- `architecture/mansor-one-blueprint.md`: blueprint v1 del sistema operativo financiero autonomo.
- `architecture/financial-events-windfall-planning.md`: eventos financieros extraordinarios y escenarios de windfall.
- `architecture/merchant-knowledge.md`: memoria de merchants y significado financiero aprendido.
- `architecture/payment-lifecycle.md`: estados canonicos futuros para pagos y reconciliacion.
- `architecture/sprint-log.md`: progreso de Sprint 1 y Sprint 2.
- `architecture/architecture-decisions.md`: ADRs vigentes.
- `deployment/vercel-readiness.md`: auditoria de preparacion para Vercel Preview y Production.
- `deployment/vercel-environment-variables.md`: inventario de variables de entorno para Vercel.
- `deployment/vercel-production-checklist.md`: checklist de salida a Production.
- `deployment/rollback-plan.md`: plan de rollback para despliegues Vercel.

## Sprint Review

Sprint 1 establecio la base de integracion financiera: Plaid, cuentas conectadas, importaciones, dashboard inicial y primeras reglas de seguridad.

Sprint 2 esta consolidando el Financial Engine como fuente de calculos. El Dashboard, Health Score, Timeline y Cards ya comenzaron a consumir datos desde el motor. Cashflow, Accounts y Plaid fueron revisadas y clasificadas para migraciones futuras mas seguras.

El blueprint v1 define la direccion de arquitectura: los engines son la fuente de verdad y las paginas son ventanas de presentacion, captura o accion.
