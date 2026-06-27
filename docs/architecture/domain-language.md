# Lenguaje de Dominio

Last updated: 2026-06-26

## Mansor One

Mansor One es el sistema operativo financiero personal. Su meta es responder preguntas practicas: cuanto dinero hay disponible, que compromisos vienen, que deuda existe, que credito queda y que decision conviene tomar.

## Financial Engine

El Financial Engine es la capa de TypeScript server-side que calcula datos financieros. No contiene React, UI, Tailwind ni componentes cliente.

## Cuenta Conectada

Cuenta traida por Plaid y guardada en `plaid_accounts`. No debe ser tratada como identidad financiera definitiva por si sola, porque puede duplicarse o cambiar con el tiempo.

## Account Resolver

Modulo que agrupa cuentas Plaid por `institution_name`, `name`, `type` y `subtype`. Devuelve una cuenta resuelta, sus cuentas fuente, duplicados y advertencias. No modifica datos.

## Assets Engine

Normaliza cuentas conectadas y cuentas manuales en un shape comun de asset. Distingue origen Plaid o manual, liquidez, credito y balances.

## Portfolio Summary

Resumen de activos, liquidez, credito, deuda, conteos y net worth basado en assets.

## Liquidity Summary

Resumen de dinero disponible, pagos pendientes, ingresos confirmados, credito conectado y tarjetas manuales.

## Planning Items

Obligaciones futuras o elementos de planificacion leidos desde `planning_items`.

## ATH Movil

ATH Movil debe cumplir un rol futuro de enriquecimiento de transacciones. No debe ser la fuente primaria de dinero disponible.

## Robototina

Robototina es el nombre del asistente financiero que reemplaza el nombre Pablo. Su funcion futura es explicar recomendaciones y decisiones usando el Financial Engine como fuente confiable.

## Categorizacion de Transacciones

El flujo futuro debe parecerse al modelo de confirmacion de Google Photos: el sistema sugiere categorias o matches, y el usuario confirma o corrige. La confirmacion mejora reglas futuras sin asumir automaticamente que todas las inferencias son verdad.
