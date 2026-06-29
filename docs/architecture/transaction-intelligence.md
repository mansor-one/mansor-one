# Transaction Intelligence

Last updated: 2026-06-26

## Proposito

Transaction Intelligence define como Mansor One debe sugerir, revisar, confirmar y aprender categorias de movimientos sin convertir `quick_entries` en un campo JSON desordenado.

Nota: existe una migracion v1 para la capa de sugerencias, revision, reglas y enriquecimientos. Todavia no esta conectada al comportamiento de Plaid import ni a `quick_entries`.

## Roles Actuales

### `quick_entries`

Es el ledger confirmado. Representa movimientos ya registrados o importados que la app trata como reales para historial, gastos y dashboard.

Debe guardar datos finales y consultables como descripcion, monto, fecha, categoria confirmada, dueno, cuenta y fuente.

### `plaid_imports`

Es la cola de candidatos importados desde Plaid. Contiene transacciones bancarias antes o durante su conversion a `quick_entries`.

Puede tener categoria sugerida e indicador `imported`, pero no debe convertirse en el motor completo de aprendizaje.

### `ath_movil_emails`

Es una fuente de enriquecimiento. ATH Movil puede aportar contexto de contraparte, mensaje, direccion y posibles categorias.

No debe ser la fuente primaria de dinero disponible ni reemplazar balances de cuentas conectadas/manuales.

## Conceptos Futuros

### `transaction_suggestions`

Tabla conceptual para sugerencias de categoria o clasificacion.

Debe guardar categoria sugerida, fuente de sugerencia, `confidence_score`, razon y referencia al movimiento/candidato.

Schema v1: `transaction_suggestions`.

### `transaction_review_items`

Tabla conceptual para el flujo de revision.

Debe guardar si algo necesita revision, pregunta visible al usuario, estado de revision y decision tomada.

Schema v1: `transaction_review_items`.

### `transaction_rules`

Tabla conceptual para reglas aprendidas.

Debe unificar ideas hoy repartidas entre `merchant_rules`, `ath_movil_rules` y reglas hardcoded de categorizacion.

Schema v1: `transaction_rules`.

### Merchant Knowledge

Merchant Knowledge es una capa de memoria e interpretacion para merchants normalizados.

No es lo mismo que `merchant_rules`. Merchant Knowledge puede recordar que `STARBUCKS #034`, `STARBUCKS PR` y `STARBUCKS STORE` representan `STARBUCKS`, calcular estadisticas y estimar confianza. Merchant Rules son reglas accionables que pueden sugerir o aplicar categorias cuando el flujo lo permita.

Merchant Knowledge alimenta Transaction Intelligence con:

- merchant normalizado
- categoria canonica probable
- cantidad de veces visto
- estadisticas de monto
- confianza
- si debe preguntarse otra vez

No debe modificar `quick_entries`, `plaid_imports`, `transaction_suggestions` ni reglas legacy en v1.

### `transaction_enrichments`

Tabla conceptual para enlazar datos externos, como ATH Movil, a una transaccion Plaid o un `quick_entry` confirmado.

Debe permitir enriquecer sin copiar todo el payload externo al ledger.

Schema v1: `transaction_enrichments`.

## Flujo Tipo Google Photos

1. El sistema detecta una transaccion o candidato.
2. Sugiere categoria, dueno o enriquecimiento con confianza.
3. Si la confianza es baja o hay ambiguedad, marca `needs_review`.
4. La UI muestra una pregunta concreta: por ejemplo, "Esto fue Colegio o Comida?".
5. El usuario confirma o corrige.
6. La decision actualiza la categoria confirmada cuando aplique.
7. La correccion puede crear o fortalecer una regla aprendida.

## Categoria Confirmada vs Categoria Sugerida

- Categoria sugerida: propuesta del sistema, Plaid, ATH, regla o modelo.
- Categoria confirmada: decision final usada para reportes, gastos e historial.

La categoria confirmada debe ser columna estable en el ledger o en el movimiento final. La categoria sugerida debe vivir en la capa de sugerencias/revision.

## Confidence Score y Needs Review

`confidence_score` debe ser columna real cuando se use para ordenar, filtrar o decidir automatizacion.

`needs_review` o `review_status` tambien debe ser columna real para construir colas de revision y contadores.

## Columnas Reales vs JSON

Usar columnas reales para datos consultados frecuentemente:

- `user_id`
- `quick_entry_id`
- `plaid_import_id`
- `ath_movil_email_id`
- `source`
- `confirmed_category`
- `suggested_category`
- `confidence_score`
- `needs_review`
- `review_status`
- `rule_id`
- `confirmed_at`

Usar JSON flexible para datos variables o diagnosticos:

- payload raw de Plaid
- payload raw/parseado de ATH
- razones detalladas de sugerencia
- candidatos alternos
- tokens o features usados para matching
- metadata de version del clasificador
- trazas de debugging

Regla: si se filtra, agrupa, une o muestra mucho, debe ser columna. Si es variable, vendor-specific o diagnostico, puede ser JSON.

## Plan de Migracion

### Etapa 1: Mantener limites actuales

- `quick_entries` sigue como ledger confirmado.
- `plaid_imports` sigue como cola Plaid.
- `ath_movil_emails` sigue como enriquecimiento.

### Etapa 2: Definir estado de revision

Crear lenguaje comun para estados:

- `suggested`
- `needs_review`
- `confirmed`
- `rejected`
- `ignored`

### Etapa 3: Crear sugerencias separadas

Crear `transaction_suggestions` para categoria sugerida, confianza y razon.

Mantener `plaid_imports.suggested_category` durante transicion.

### Etapa 4: Unificar reglas

Crear `transaction_rules` como sucesor gradual de reglas actuales.

Debe aceptar reglas por merchant, counterparty, fuente, texto, cuenta o patron.

### Etapa 5: Enlazar ATH como enriquecimiento

Crear `transaction_enrichments` para asociar ATH a Plaid o `quick_entries`.

No copiar todo ATH al ledger.

### Etapa 6: UI de confirmacion

Construir una cola de revision estilo Google Photos:

- mostrar sugerencia
- explicar razon
- pedir confirmacion
- aprender de correcciones

### Etapa 7: Limpiar legado

Mover gradualmente inteligencia fuera de `plaid_imports.suggested_category` y reglas hardcoded cuando haya tablas nuevas.

## Estado de Implementacion

- Migracion v1 creada: `migrations/20260626_transaction_intelligence_v1.sql`.
- Pagina dev read-only creada: `/dev/transaction-intelligence`.
- No se modifico el comportamiento de `quick_entries`.
- No se modifico el comportamiento de Plaid import.
- No se modificaron Dashboard, Timeline, Cards, Health, Cashflow ni calculos del Financial Engine.
