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

## ADR-008: Transaction Categories Must Be Canonical, Not Free-Text

Estado: aceptado.

Las categorias de transacciones deben migrar hacia identificadores canonicos (`category_id` o `category_code`). Los labels deben ser solo display y no la identidad del dato.

Consecuencia: Robototina y la cola de revision deben usar un picker controlado de categorias. `Revisar` debe tratarse como estado de revision, no como categoria. `Sin categoria` debe ser fallback visual, no un valor almacenado. `quick_entries` no se modifica todavia; la migracion debe ser gradual.

## ADR-009: Category System V1 Keeps Legacy Text During Migration

Estado: aceptado.

Category System v1 introduce `transaction_categories` como tabla canonica para categorias del sistema y categorias del usuario.

Consecuencia: la tabla canonica existe para tooling, validacion y migracion futura, pero `quick_entries`, `plaid_imports`, `transaction_suggestions`, Spending, History y Robototina mantienen sus campos de texto legacy hasta una migracion posterior.

## ADR-010: Expected Windfalls Are Planning Inputs, Not Current Cash

Estado: aceptado.

Ingresos extraordinarios esperados, como Team Share Bonus o Christmas Bonus, no deben contarse como efectivo actual ni como liquidez disponible hasta que sean recibidos y registrados.

Consecuencia: estos eventos deben alimentar Financial Summary, Decision Engine, Robototina, Planning y un Debt Engine futuro como escenarios y horizonte de planificacion. Mansor One puede preparar recomendaciones, pero debe pedir confirmacion antes de asumir montos definitivos o asignaciones como pago de tarjetas, balance transfer, consolidacion, metas u obligaciones.

## ADR-011: Payment Lifecycle V1 Separates Intent From Reconciliation

Estado: aceptado.

Los pagos deben migrar gradualmente hacia estados canonicos `pending`, `initiated` y `confirmed`, manteniendo compatibilidad con estados legacy como `promise` y `paid`.

`initiated` existe porque en la vida real hay un periodo entre iniciar un pago y verlo confirmado por banco, Plaid o ledger manual. Este estado permite reducir preguntas repetidas sin tratar el pago como completamente confirmado.

Consecuencia: reconciliacion debe permanecer separada del lifecycle. El estado describe la creencia actual sobre la obligacion; la reconciliacion debe probarla contra movimientos, transacciones o un ledger futuro. No se cambia schema ni comportamiento actual en v1.

## ADR-012: Canonical Category Engine Defines Financial Meaning

Estado: aceptado.

Merchant no es categoria. Plaid category no es categoria canonica. La categoria canonica representa el significado financiero que Mansor One usa para reportes, decisiones, reglas y Robototina.

Consecuencia: `lib/financial-engine/categories.ts` define un registro canonico de categorias de sistema. Las tablas legacy con texto libre no se migran todavia, pero futuros motores deben consumir el registro canonico antes de escribir nuevas clasificaciones.

## ADR-013: Merchant Knowledge Is Memory, Not Rules

Estado: aceptado.

Merchant Knowledge recuerda merchants normalizados, estadisticas, categoria canonica probable y confianza. Merchant Rules son reglas accionables que podran sugerir o aplicar categorias cuando el flujo de Transaction Intelligence lo permita.

Consecuencia: `lib/financial-engine/merchant-knowledge.ts` no modifica categorizacion existente, `merchant_rules`, `transaction_suggestions`, `plaid_imports` ni `quick_entries`. En v1 solo provee helpers deterministas para que Transaction Intelligence pueda aprender sin acoplar merchant, Plaid category y categoria canonica.

## ADR-014: Engines Are Source Of Truth, Pages Are Windows

Estado: aceptado.

Mansor One debe organizar su arquitectura alrededor de engines de dominio. Los engines calculan, interpretan, clasifican, priorizan o proponen. Las paginas presentan ventanas hacia ese estado, capturan entradas del usuario o ejecutan acciones explicitas.

Consecuencia: no se deben duplicar calculos financieros, categoria/identity logic, payment lifecycle, reconciliacion o prioridad de decisiones dentro de paginas. Si una pagina necesita un dato o interpretacion, debe venir de Portfolio, Liquidity, Planning, Financial Summary, Decision Engine, Financial Reconciliation o el knowledge engine correspondiente.

## ADR-015: Goal Balances Are Ledger-Derived

Estado: aceptado.

Las metas financieras no deben guardar `currentBalance` como verdad editable. El balance debe derivarse del funding ledger de la meta: deposits y `transfer_in` suman, withdrawals y `transfer_out` restan, y adjustments aplican su monto con signo.

Consecuencia: Goal Engine puede calcular progreso, remaining amount, health y confianza de forma auditable. Una futura tabla persistente de goals debe preservar el ledger como fuente de verdad y tratar cualquier balance materializado como cache o snapshot, no como dato primario.
