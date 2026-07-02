# Architecture Decision Records

Last updated: 2026-07-02

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

## ADR-011: Payment Lifecycle V2 Separates Expected Cycles, Confirmation, And Reconciliation

Estado: aceptado.

Los pagos deben migrar gradualmente hacia estados canonicos `pending`, `initiated` y `confirmed`, manteniendo compatibilidad con estados legacy como `promise` y `paid`.

`initiated` existe porque en la vida real hay un periodo entre iniciar un pago y verlo confirmado por banco, Plaid o ledger manual. Este estado permite reducir preguntas repetidas sin tratar el pago como completamente confirmado.

En v2, las paginas deben consumir una vista compartida de lifecycle. Si el ciclo actual esta cerrado por `paid`, `confirmed`, `closed` o por un movimiento confirmado en ledger, la proxima fecha esperada debe avanzar al siguiente ciclo. Un ciclo solo esta vencido si su fecha efectiva, incluyendo grace period cuando exista, es anterior a hoy y el ciclo no esta cerrado.

Consecuencia: Dashboard, Cards, Robototina, Timeline y Planning preview no deben leer `payment_instances` crudo como verdad final. Deben consumir el mismo output de lifecycle para evitar estados divergentes. Reconciliacion debe permanecer separada del lifecycle: el estado describe la creencia actual sobre la obligacion; la reconciliacion prueba esa creencia contra movimientos, transacciones o un ledger futuro.

## ADR-012: Canonical Category Engine Defines Financial Meaning

Estado: aceptado.

Merchant no es categoria. Plaid category no es categoria canonica. La categoria canonica representa el significado financiero que Mansor One usa para reportes, decisiones, reglas y Robototina.

Consecuencia: `lib/financial-engine/categories.ts` define un registro canonico de categorias de sistema. Las tablas legacy con texto libre no se migran todavia, pero futuros motores deben consumir el registro canonico antes de escribir nuevas clasificaciones.

## ADR-013: Merchant Knowledge Is Memory, Not Rules

Estado: aceptado.

Merchant Knowledge recuerda merchants normalizados, estadisticas, categoria canonica probable y confianza. Merchant Rules son reglas accionables que podran sugerir o aplicar categorias cuando el flujo de Transaction Intelligence lo permita.

Merchant Learning debe ser event-driven: las confirmaciones de usuario y los movimientos confirmados son eventos de aprendizaje. El sistema puede derivar memoria desde `quick_entries` confirmados y, en una version persistente futura, registrar observaciones, cambios, drift y confianza como eventos auditables.

Consecuencia: `lib/financial-engine/merchant-knowledge.ts` no debe aprender de sugerencias o import candidates como si fueran verdad. Puede usar imports como senal de "seen", pero la categoria aprendida debe venir de confirmaciones o ledger confirmado. Merchant Knowledge no modifica categorizacion existente, `merchant_rules`, `transaction_suggestions`, `plaid_imports` ni `quick_entries` directamente.

## ADR-014: Engines Are Source Of Truth, Pages Are Windows

Estado: aceptado.

Mansor One debe organizar su arquitectura alrededor de engines de dominio. Los engines calculan, interpretan, clasifican, priorizan o proponen. Las paginas presentan ventanas hacia ese estado, capturan entradas del usuario o ejecutan acciones explicitas.

Consecuencia: no se deben duplicar calculos financieros, categoria/identity logic, payment lifecycle, reconciliacion o prioridad de decisiones dentro de paginas. Si una pagina necesita un dato o interpretacion, debe venir de Portfolio, Liquidity, Planning, Financial Summary, Decision Engine, Financial Reconciliation o el knowledge engine correspondiente.

## ADR-015: Goal Balances Are Ledger-Derived

Estado: aceptado.

Las metas financieras no deben guardar `currentBalance` como verdad editable. El balance debe derivarse del funding ledger de la meta: deposits y `transfer_in` suman, withdrawals y `transfer_out` restan, y adjustments aplican su monto con signo.

Consecuencia: Goal Engine puede calcular progreso, remaining amount, health y confianza de forma auditable. Una futura tabla persistente de goals debe preservar el ledger como fuente de verdad y tratar cualquier balance materializado como cache o snapshot, no como dato primario.

## ADR-016: Review Queue Is The Ingestion Gate For Unconfirmed Movements

Estado: aceptado.

External sources such as Plaid, ATH Movil, Gmail and future OCR may create source observations or enrichment, but they must not create confirmed financial history automatically.

The Review Queue is the user-facing ingestion gate for ambiguous or unconfirmed movements. Promotion into `quick_entries` must happen through explicit user confirmation, duplicate cleanup, or a narrowly scoped safe promotion helper that verifies ownership and idempotency.

Consecuencia: Plaid sync may create or update `plaid_accounts` and `plaid_imports`, but not ledger rows. Spending, History and confirmed Dashboard movements should come from confirmed ledger entries, while Review Queue remains the place where candidates become history.

## ADR-017: Plaid Sync Stores Source Facts, Not Financial Meaning

Estado: aceptado.

Plaid sync has two separate responsibilities:

- account sync updates connected account facts in `plaid_accounts`
- transaction sync creates or updates source candidates in `plaid_imports`

Plaid sync may run cleanup that marks imports as already imported when the same user already has a confirmed `quick_entries.plaid_transaction_id`, and may backfill missing account context from `plaid_accounts`. It must not create ledger entries automatically.

Consecuencia: sync responses should distinguish transactions returned by Plaid, new imports created, pending imports, rows cleaned and context backfilled. Future Plaid Sync v2 should persist transaction sync cursors per connection and consider uniqueness on `(user_id, plaid_transaction_id)`.

## ADR-018: Planning Obligations Separate Obligation From Provider

Estado: aceptado.

Recurring household services and obligations should model the durable need separately from the current vendor or provider.

Examples:

- obligation: Recorte de grama; current vendor: Figueroa Guardia
- obligation: Fumigacion; current vendor: Felix

Consecuencia: changing provider, phone, amount, frequency, category, owner or payment method must not delete or rewrite historical payments. Planning v2 should show the obligation first and the current provider second.

## ADR-019: Mansor One Is Household Finance

Estado: aceptado.

Mansor One should support Manuel and Soraya as a shared household finance system, not a single-person app with hardcoded ownership assumptions.

Owner labels, Plaid accounts, manual records, Planning items, obligations, Review Queue context and Robototina briefings should be household-aware. Until a durable household model exists, UI may use "Manuel y Soraya" or "familia" for shared surfaces and should avoid implying that every transaction belongs only to Manuel.

Consecuencia: before using Soraya FirstBank or Vec Solutions in production, depository account owner labeling and a household ownership model are required. Page-level owner logic should not be duplicated; ownership should flow through Financial Engine or a dedicated household model.

## ADR-020: Obligations Are A Separate Domain

Estado: aceptado.

Non-card recurring obligations should not be forced into `scheduled_payments`.

Obligations model durable household commitments such as Toyota, Honda, water, recorte de grama and fumigacion. The obligation is separate from the current provider/vendor, expected cycle instances and payment links.

Consecuencia: Obligations v1 uses dedicated tables: `obligations`, `obligation_providers`, `obligation_instances` and `obligation_payment_links`. These tables are not connected to UI yet, do not migrate `scheduled_payments` yet and do not seed real data yet. Future Financial Engine work should merge these obligation instances into the shared Payment Lifecycle output.
