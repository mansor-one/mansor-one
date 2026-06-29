# Financial Events y Windfall Planning

Last updated: 2026-06-26

## Proposito

Mansor One debe operar automaticamente la mayor parte del tiempo y pedir confirmacion solo cuando aparece algo extraordinario o ambiguo.

Financial Events / Windfall Planner representa ingresos esperados no recurrentes, como bonos, ventas, refunds grandes, herencias o pagos extraordinarios. Su rol es ayudar a decidir antes de recibir el dinero, sin tratarlo como efectivo disponible.

## Ingreso Recurrente vs Ingreso Extraordinario

Ingreso recurrente:

- Se modela en `income_schedule`.
- Es parte del ritmo normal de liquidez.
- Puede usarse para proyecciones de corto plazo cuando esta confirmado.

Ingreso extraordinario esperado:

- No debe contarse como cash actual.
- Debe entrar en el horizonte de planificacion.
- Debe alimentar escenarios antes de tomar decisiones.
- Requiere confirmacion del usuario antes de asumir una asignacion.

## Conceptos Futuros

### `expected_financial_events`

Eventos financieros esperados:

- nombre
- tipo: bonus, refund, sale, tax_return, other
- fecha esperada o ventana esperada
- monto estimado
- moneda
- confianza: estimated, likely, confirmed
- owner
- notas
- status: expected, received, cancelled

### `windfall_scenarios`

Escenarios para decidir que hacer con un evento:

- evento relacionado
- nombre del escenario
- estrategia: preserve_cash, pay_debt, balance_transfer, consolidate_loan, fund_goals, mixed
- impacto esperado en deuda, cash y obligaciones
- riesgo
- estado de revision

### `windfall_allocations`

Asignaciones propuestas o confirmadas:

- escenario relacionado
- destino: credit_card, loan, planning_item, cash_reserve, goal, manual
- monto
- prioridad
- requiere confirmacion
- confirmado por usuario

## Ejemplos Iniciales

### Team Share Bonus

- nombre: Team Share Bonus
- fuente: Coca-Cola / Team Share
- ventana esperada: marzo
- monto estimado: 16000
- confianza: estimated
- uso: escenarios de pago de deuda, balance transfers, consolidacion, prioridades y reserva de cash.

### Christmas Bonus

- nombre: Christmas Bonus
- ventana esperada: antes de Black Friday
- monto estimado: TBD
- confianza: estimated
- uso: escenario de cierre de ano, compras grandes, deudas y reserva de cash.

## Como Alimenta Otros Modulos

### Financial Summary

Financial Summary puede mostrar que existe un evento esperado dentro del horizonte, pero no debe sumarlo a `availableToday` ni a liquidez actual.

Debe interpretar:

- evento esperado pronto
- monto estimado
- confianza
- presion de deuda u obligaciones que podria aliviar

### Decision Engine

Decision Engine puede generar decisiones como:

- preparar escenario para bono esperado
- evitar decisiones irreversibles hasta confirmar monto
- priorizar deuda de mayor impacto
- recomendar analizar balance transfer o consolidacion
- pedir confirmacion de asignacion cuando el evento este cerca

### Robototina

Robototina debe preguntar solo cuando haya una decision real:

- "En marzo esperas aproximadamente $16,000 de Team Share. Quieres que prepare escenarios para deuda, cash y prioridades?"
- "Si el bono llega completo, puedo comparar pagar tarjetas vs consolidar deuda. Lo revisamos?"
- "Antes de asumir ese dinero, confirmame si el monto estimado sigue siendo razonable."
- "El Christmas Bonus aun no tiene monto. Quieres dejarlo como evento esperado sin usarlo en decisiones?"

### Planning

Planning puede usar eventos extraordinarios para horizonte y escenarios, no para cash actual.

Ejemplos:

- planificar pago grande de tarjeta
- financiar una obligacion futura
- reservar cash minimo
- asignar parte a metas

### Debt Engine

Debt Engine futuro debe usar windfalls para comparar:

- pagar tarjetas directamente
- cancelar tarjetas despues de saldarlas
- hacer balance transfers
- solicitar prestamo de consolidacion
- hacer pagos grandes por APR o utilizacion
- preservar cash si el riesgo de liquidez es alto

## Reglas De Recomendacion

- No contar bono esperado como cash actual.
- Incluirlo en horizonte de planificacion.
- Usarlo para escenarios, no para decisiones automaticas finales.
- Pedir confirmacion antes de asumir asignacion.
- Distinguir monto estimado de monto confirmado.
- Si la confianza es estimated, mostrar lenguaje condicional.
- Si el evento se confirma o recibe, entonces puede pasar a cash/ledger por los canales normales.

## Flujo Futuro

1. Registrar evento esperado.
2. Financial Summary lo interpreta como oportunidad futura.
3. Decision Engine propone escenarios.
4. Robototina pide confirmacion solo cuando el evento sea relevante.
5. Usuario confirma monto o asignacion.
6. Planning y Debt Engine actualizan prioridades.
7. Cuando el dinero llega, se registra como ingreso real y se ejecutan decisiones confirmadas.

## No Implementado Todavia

No existe schema para estos conceptos.

No se modifica `income_schedule`, `quick_entries`, `planning_items`, Portfolio, Liquidity, Financial Summary, Decision Engine ni Robototina en esta fase.
