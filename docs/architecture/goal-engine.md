# Goal Engine

Last updated: 2026-06-26

## Proposito

Goal Engine modela metas financieras sin tratarlas como obligaciones, pagos o
balances de cuenta.

Una meta representa intencion: crear fondo de emergencia, preparar un viaje,
reducir deuda, financiar una prioridad familiar, invertir o evaluar un
escenario futuro.

## Regla Principal

Los balances de metas se derivan del ledger.

Mansor One no debe almacenar un `currentBalance` editable como fuente de verdad.
El balance de una meta se calcula desde su funding ledger:

- `deposit` y `transfer_in` aumentan el balance.
- `withdrawal` y `transfer_out` reducen el balance.
- `adjustment` aplica su monto con signo.

Esto mantiene una ruta auditable entre movimientos de funding y progreso.

## Metas No Son Obligaciones

Las metas son objetivos opcionales o estrategicos. No son lo mismo que:

- `payment_instances`, que representan obligaciones vencidas o proximas.
- pagos programados, que representan bills recurrentes.
- planning items, que representan compromisos futuros o presion financiera.

Robototina no debe tratar una meta de vacaciones sin funding igual que una
factura pendiente de utilidad.

## Health

Goal health v1 es deterministico:

- `completed`: el balance calculado alcanza o excede el target.
- `delayed`: la fecha objetivo paso y la meta no esta completada.
- `at_risk`: el funding mensual requerido es mayor que el funding mensual planificado.
- `waiting_event`: la meta depende de un windfall futuro y no debe medirse por funding mensual.
- `planned`: la meta esta planificada, pero no depende de una contribucion mensual activa.
- `healthy`: los supuestos actuales son suficientes.

Las metas `windfall_only` no deben marcarse `at_risk` solo porque no tienen
funding mensual. Si la fecha objetivo esta en el futuro y el balance es cero,
la meta debe esperar el evento. Si la fecha objetivo pasa sin funding, entonces
si debe marcarse `delayed`.

## Confidence

Goal confidence v1 es una interpretacion simple.

Sube cuando:

- existe una estrategia recurrente de funding.
- la fecha objetivo parece realista.

Baja cuando:

- no hay funding entries.
- la fecha objetivo esta cerca y el progreso es bajo.
- la meta no esta activa.

## Conexiones Futuras

Goal Engine se conectara luego con:

- Planning, para entender compromisos futuros que compiten por cash.
- Financial Events / Windfalls, para modelar bonos y grandes inflows esperados.
- Decision Engine, para decidir cuando conviene financiar una meta.
- Robototina, para explicar progreso y pedir decisiones de asignacion.
- Optimization, para comparar metas contra pago de deuda, preservacion de liquidez y riesgo.

## Limite V1

Goal Engine v1 es read-only y en memoria. Introduce modelos TypeScript y helpers
deterministicos. No implementa schema ni persistencia todavia.
