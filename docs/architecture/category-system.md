# Category System

Last updated: 2026-06-26

## Sprint Review

El sistema de categorias ya tiene una base canonica v1 con `transaction_categories`. Las categorias legacy siguen viviendo como texto libre en varias tablas y pantallas hasta que se haga la migracion de escritura y lectura.

## Estado Actual

Las categorias operativas actuales siguen siendo free-text. Aparecen en campos como:

- `quick_entries.category`
- `plaid_imports.suggested_category`
- `transaction_suggestions.suggested_category`
- `merchant_rules.suggested_category`
- `ath_movil_rules.category`
- `ath_movil_emails.suggested_category`

Esto permite que diferentes partes del sistema creen nombres distintos para la misma idea. Ejemplos: `Comida`, `Comida fuera`, `Fast Food` y `Comida / Familia`.

## Problemas

- Casing inconsistente.
- Duplicados semanticos por nombres distintos.
- Mezcla de español e ingles.
- Categorias de gasto mezcladas con estados de revision.
- Categorias de movimiento financiero mezcladas con categorias de consumo.
- Reportes agrupados por texto crudo, lo que fragmenta totales.

`Revisar` no debe ser una categoria. Es un estado de revision.

`Sin categoria` no debe ser una categoria almacenada. Es un fallback visual cuando no hay categoria confirmada.

## Modelo Canonico V1

`transaction_categories` define el vocabulario canonico base. Las transacciones eventualmente deben usar un identificador estable:

- `category_id` o `category_code` para calculo y relaciones futuras.
- `label` solo para display.
- `parent_id` opcional para jerarquia.
- `kind` para distinguir gasto, ingreso, transferencia, pago o categoria de sistema.
- `is_system` para categorias globales.
- `user_id` nullable para categorias creadas por usuario.
- `is_active` para ocultar sin borrar.

Los labels pueden cambiar sin romper reportes. Los codigos no deben cambiar una vez usados.

V1 no conecta esta tabla a `quick_entries`, `plaid_imports` ni `transaction_suggestions` todavia.

## Categorias Del Sistema Y Del Usuario

El sistema debe soportar ambas:

- Categorias del sistema: vocabulario base que Robototina, reportes y reglas entienden.
- Categorias del usuario: categorias personales creadas deliberadamente.

Las categorias de usuario deben mapearse a una categoria padre del sistema para mantener reportes comparables.

## Jerarquia

La jerarquia debe ser superficial, maximo dos niveles:

- Padre
- Hijo

No se recomienda una taxonomia profunda porque complica la revision diaria y reduce consistencia.

## Set Inicial Propuesto

- Comida
  - Comida fuera
  - Supermercado
  - Cafetería trabajo
- Salud
  - Farmacia
  - Médico / Laboratorio
- Transporte
  - Gasolina
  - Parking
  - AutoExpreso
- Casa
  - Servicios
  - Compras del hogar
- Familia
  - Andrea
  - Gaby
  - Soraya
- Negocio Soraya
- Tecnología
  - Software / Suscripciones
- Deudas
  - Pago de tarjeta
  - Préstamo
- Financiero
  - Transferencia
  - Ingreso
  - Efectivo
- Entretenimiento
- Educación
- Otros

## Robototina

Robototina debe presentar categorias con un picker controlado:

- Combo box con busqueda.
- Sugerencia destacada primero.
- Categorias agrupadas por padre.
- Confianza visible cuando aplique.
- Opcion explicita para crear nueva categoria.

Robototina no debe pedir texto libre como primera opcion. Si una categoria nueva es necesaria, debe crearse deliberadamente y mapearse a una categoria padre.

## Nuevas Categorias

Crear una categoria nueva debe requerir:

- Nombre visible.
- Categoria padre.
- Confirmacion del usuario.
- Registro como categoria de usuario.

No se deben crear categorias automaticamente desde merchants, notas o payloads de Plaid.

## Migracion Futura

La migracion de texto libre debe ser gradual:

1. Mantener `transaction_categories` como tabla canonica.
2. Agregar columnas nullable `category_id` o `category_code` a tablas relevantes.
3. Crear mapping de textos actuales a categorias canonicas.
4. Backfill de valores obvios.
5. Actualizar Robototina y review queue para escribir categorias canonicas.
6. Actualizar Spending e History para agrupar por categoria canonica.
7. Mantener columnas de texto durante transicion.
8. Deprecar escritura free-text cuando el flujo nuevo este validado.

## Fuera De Alcance Por Ahora

- No tocar `quick_entries` todavia.
- No modificar `transaction_suggestions` directamente.
- No cambiar UI todavia.
- No eliminar `plaid_imports.suggested_category` durante la transicion.
- No mover reglas existentes hasta que el modelo canonico este conectado a los flujos de escritura.
