# Sprint Log

Last updated: 2026-07-02

## Sprint Review

Sprint 1 creo la base operativa. Sprint 2 separo calculos financieros de la UI. La arquitectura actual esta orientada a engines compartidos, Review Queue como puerta de ingestion, Plaid como fuente de facts, Payment Lifecycle compartido y household finance para Manuel y Soraya.

## Sprint 1

Progreso definido:

- Integracion inicial de Plaid.
- Manejo de conexiones en `plaid_connections`.
- Importacion de transacciones.
- Correcciones de permisos para que RLS funcione sin service role.
- Dashboard inicial con liquidez, deuda, ingresos y pagos.
- Reglas de seguridad: usar usuario autenticado, evitar anon bypass, evitar `USING (true)` y `WITH CHECK (true)`.

## Sprint 2

Progreso definido:

- Creacion del Financial Engine.
- Creacion del Account Resolver para duplicados Plaid.
- Creacion del Assets Engine.
- Creacion de Portfolio Summary.
- Consolidacion de Liquidity Summary y Planning Summary.
- Dashboard migrado a Financial Engine.
- Health Score migrado a Portfolio Summary.
- Timeline starting cash migrado a Portfolio Summary.
- Cards manual data migrado a Liquidity Summary.
- Cashflow revisado, no migrado.
- Accounts revisado, no migrado.
- Plaid clasificado como Integration Page.
- Transaction Intelligence documentado y schema v1 preparado sin integrarlo aun al flujo principal.
- Transaction Review Queue v1 agregado como schema aislado y pagina dev read-only.
- Category System documentado como modelo canonico futuro para reemplazar categorias free-text.
- ADR-008 agregado: las categorias de transacciones deben ser canonicas, no texto libre.
- Category System v1 creado con `transaction_categories`, seed inicial y pagina dev read-only.
- ADR-009 agregado: las categorias canonicas existen, pero los campos legacy de texto se mantienen durante migracion.
- Financial Events / Windfall Planning documentado para bonos y eventos extraordinarios esperados.
- ADR-010 agregado: los ingresos extraordinarios esperados alimentan escenarios, no cash actual.
- Payment Lifecycle v1 documentado para separar intencion de pago y reconciliacion futura.
- ADR-011 agregado: `initiated` existe como estado intermedio antes de confirmacion.
- Canonical Category Engine v1 creado como registro central en `lib/financial-engine/categories.ts`.
- ADR-012 agregado: merchant y Plaid category son senales; categoria canonica es significado financiero.
- Merchant Knowledge Engine v1 creado como base para normalizar merchants, estadisticas y confianza.
- ADR-013 agregado: Merchant Knowledge es memoria, no reglas accionables.
- Financial Identity Engine v1 creado para clasificar nombres de transacciones por tipo de entidad o evento financiero.
- Financial Reconciliation Engine v1 creado como matcher read-only entre transacciones/imports y `payment_instances`.
- Mansor One Architecture Blueprint v1 documentado como mapa general del sistema operativo financiero autonomo.
- ADR-014 agregado: engines son fuente de verdad y paginas son ventanas.
- Goal Engine v1 creado como fundacion read-only para metas, funding ledger, progreso, health y confianza.
- ADR-015 agregado: los balances de metas se derivan del ledger, no se almacenan manualmente.
- Review Queue documentado como puerta de ingestion para movimientos no confirmados.
- Plaid Sync Flow documentado: account sync, transaction sync, cleanup, backfill y limites de seguridad.
- Payment Lifecycle actualizado a v2: ciclo cerrado avanza proxima fecha, overdue solo si ciclo abierto y fecha efectiva paso.
- Merchant Learning documentado como aprendizaje event-driven desde confirmaciones y ledger confirmado.
- Planning/Obligations v2 documentado: obligacion recurrente separada de vendor/proveedor.
- Household Finance documentado para Manuel y Soraya, incluyendo owner labeling futuro para FirstBank/Soraya.
- ADR-016 agregado: Review Queue es el ingestion gate para movimientos no confirmados.
- ADR-017 agregado: Plaid Sync guarda source facts, no significado financiero confirmado.
- ADR-018 agregado: Planning Obligations separa obligacion de proveedor.
- ADR-019 agregado: Mansor One es household finance.

## Pendiente

- Backlog P0/P1 futuro, no implementado todavia: agregar obligaciones Honda y Toyota al Payment Lifecycle mediante el Financial Engine, no con logica de pagina.
- Backlog P1 futuro, no implementado todavia: mejorar visibilidad credito vs debito en Dashboard y Spending desde un helper compartido del Financial Engine.
- Backlog P1 futuro, no implementado todavia: planificar Robototina v2 como asistente accionable que proponga decisiones, explique tradeoffs y pida confirmacion, no como beta message board.
- Backlog P1 futuro, no implementado todavia: preparar modelo de household/owners para visibilidad de Soraya, FirstBank y Vec Solutions sin duplicar logica por pagina.
- Backlog P0 futuro, no implementado todavia: antes de usar FirstBank Soraya en produccion, agregar owner labeling para cuentas Plaid depository y conectarlo al modelo household.
- Backlog P1 futuro, no implementado todavia: Financial Categories v2 debe agregar Sports, reclasificar servicios recurrentes de Amazon como Subscriptions, organizar categorias por grupos logicos, permitir que Merchant Learning aprenda categoria desde confirmaciones y mantener categorias genericas para finanzas del household.
- Backlog P1 futuro, no implementado todavia: Plaid Sync v2 debe persistir transaction sync cursor por conexion y evaluar migrar unicidad de imports a `(user_id, plaid_transaction_id)` en vez de depender de unicidad global del Plaid transaction id.
- Backlog P1 futuro, no implementado todavia: Planning/Obligations debe separar obligacion recurrente de vendor/proveedor actual para servicios del hogar como recorte de grama y fumigacion; cambiar proveedor no debe borrar ni reescribir pagos historicos.
- Regla para estos backlog items: todo debe fluir por Financial Engine o motores derivados, no por calculos locales en Dashboard, Spending, Planning, Timeline, Cards ni Robototina.
- Mantener documentacion de ADRs, blueprint y sprint log sincronizada al cerrar cada sprint.
- Rediseñar Accounts como superficie unificada de assets con mutaciones separadas.
- Definir si Cashflow debe seguir usando `scheduled_payments` o migrar a `payment_instances`.
- Renombrar Pablo a Robototina en UI y dominio cuando se planifique el cambio.
- Diseñar confirmacion de categorias de transacciones con modelo tipo Google Photos.
- Definir ATH Movil como enriquecimiento de transacciones, no fuente primaria de dinero.
- Definir migracion futura para `transaction_suggestions`, `transaction_review_items`, `transaction_rules` y `transaction_enrichments`.
- Conectar Transaction Intelligence a Plaid import y a confirmaciones de usuario en una fase posterior.
- Conectar Robototina y review queue al picker canonico de categorias.
- Migrar textos existentes de categorias a `category_id` o `category_code` sin tocar `quick_entries` todavia.
- Definir schema futuro para `expected_financial_events`, `windfall_scenarios` y `windfall_allocations`.
- Crear Debt Engine para comparar pago de tarjetas, cancelacion, balance transfers, consolidacion y preservacion de cash.
- Migrar `payment_instances.status` gradualmente hacia `pending`, `initiated` y `confirmed` sin romper compatibilidad con `paid` y `promise`.
- Disenar ledger de pagos para paid amount, paid date, parciales y atrasos.
- Migrar `quick_entries`, `plaid_imports`, `transaction_suggestions` y reglas hacia `category_code` o `category_id` canonico cuando el flujo este listo.
- Conectar Merchant Knowledge a Transaction Intelligence cuando existan fuentes persistentes y flujo de revision.
- Conectar Financial Reconciliation a un flujo futuro de confirmacion con auditoria antes de marcar pagos como confirmados.
- Mantener el blueprint actualizado cuando se agreguen Financial Events, Debt Engine, Loan Engine, Optimization Engine y Financial Memory.
- Conectar Goal Engine a Planning, Financial Events, Decision Engine, Robototina y Optimization cuando exista schema persistente.
