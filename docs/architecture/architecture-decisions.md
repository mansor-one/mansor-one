# Architecture Decision Records

Last updated: 2026-06-26

## Sprint Review

Las decisiones actuales buscan reducir duplicacion, proteger datos por usuario y mantener separadas las capas de integracion, calculo y presentacion.

## ADR-001: Financial Engine Owns Financial Calculations

Estado: aceptado.

Los calculos financieros deben vivir en `lib/financial-engine`. Las paginas deben consumir summaries o datos normalizados y enfocarse en presentacion.

Consecuencia: no duplicar calculos de liquidez, deuda, credito, assets o planificacion dentro de paginas cuando ya existan en el Financial Engine.

## ADR-002: Plaid Account Is Not The Financial Identity

Estado: aceptado.

Una cuenta Plaid puede duplicarse o variar. La identidad financiera visible debe pasar por Account Resolver y Assets Engine.

Consecuencia: Dashboard y summaries deben usar cuentas resueltas, no sumar `plaid_accounts` directamente.

## ADR-003: Dashboard Is Presentation Layer

Estado: aceptado.

El Dashboard debe presentar resultados calculados por `getDashboardSummary()` y `getPortfolioSummary()`.

Consecuencia: nuevas metricas del Dashboard deben agregarse al Financial Engine antes de renderizarse.

## ADR-004: ATH Movil Is Transaction Enrichment

Estado: aceptado.

ATH Movil no debe ser la fuente primaria de dinero disponible. Su rol futuro es enriquecer transacciones, contexto de comerciantes y posibles movimientos.

Consecuencia: balances y liquidez siguen viniendo de cuentas conectadas, cuentas manuales y summaries financieros.

## ADR-005: Robototina Is The Assistant Name

Estado: aceptado.

Robototina reemplaza el nombre Pablo como asistente financiero.

Consecuencia: futuras interfaces, recomendaciones y documentacion de asistente deben usar Robototina. El codigo existente puede migrarse gradualmente para evitar cambios grandes innecesarios.

## ADR-006: Transaction Intelligence Must Not Overload quick_entries JSON

Estado: aceptado.

`quick_entries` debe seguir siendo el ledger confirmado de movimientos. La inteligencia de transacciones debe vivir en estructuras separadas para sugerencias, revision, reglas y enriquecimientos.

Consecuencia: no se debe resolver el aprendizaje estilo Google Photos agregando un JSON gigante a `quick_entries`. Las columnas estables deben usarse para estado consultable, y JSON solo para metadata flexible, payloads raw o diagnosticos.

## ADR-007: Transaction Intelligence Uses Separate Review/Suggestion Tables Before Modifying quick_entries

Estado: aceptado.

La primera implementacion de Transaction Intelligence debe crear una capa separada de sugerencias, review items, reglas y enriquecimientos antes de cambiar el ledger confirmado.

Consecuencia: `quick_entries` y Plaid import mantienen su comportamiento actual. La nueva capa puede observarse y validarse desde tooling dev antes de incorporarse al flujo principal de movimientos.
