# Sprint Log

Last updated: 2026-06-26

## Sprint Review

Sprint 1 creo la base operativa. Sprint 2 esta separando calculos financieros de la UI.

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

## Pendiente

- Rediseñar Accounts como superficie unificada de assets con mutaciones separadas.
- Definir si Cashflow debe seguir usando `scheduled_payments` o migrar a `payment_instances`.
- Renombrar Pablo a Robototina en UI y dominio cuando se planifique el cambio.
- Diseñar confirmacion de categorias de transacciones con modelo tipo Google Photos.
- Definir ATH Movil como enriquecimiento de transacciones, no fuente primaria de dinero.
- Definir migracion futura para `transaction_suggestions`, `transaction_review_items`, `transaction_rules` y `transaction_enrichments`.
- Conectar Transaction Intelligence a Plaid import y a confirmaciones de usuario en una fase posterior.
- Conectar Robototina y review queue al picker canonico de categorias.
- Migrar textos existentes de categorias a `category_id` o `category_code` sin tocar `quick_entries` todavia.
