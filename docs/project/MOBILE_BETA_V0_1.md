# Mobile Beta v0.1 — validación local

## Base

- Branch: `feature/mobile-beta-v0.1`.
- HEAD inicial: `10b64a99cba943e7dd4bdaa63540d87ebd7348d0`.
- Worktree limpio verificado antes de editar.
- No se crearon commits ni se hicieron push, merge, SQL, migraciones, db push o deployments. No se consultaron Supabase ni Vercel.

## Alcance

El checkpoint ya incluía manifest standalone, metadata Apple/viewport, iconos locales, navegación inferior, safe areas verticales, agenda móvil, paginación de Review Queue e History, y tarjetas responsive de Reports. Esta iteración completa huecos concretos:

- Manifest permite ambas orientaciones; se verifican las dimensiones PNG contra el manifest y el icono Apple de 180 px.
- Navegación inferior oculta explícitamente en desktop, foco visible, semántica accesible, cierre del menú al pasar a desktop y prefetch desactivado en sus enlaces.
- Cierre de sesión conserva `scope: global` y reemplazo de ubicación a `/login`; errores de red muestran un mensaje y permiten reintentar.
- Safe areas iOS también a izquierda/derecha, menús y drawers con contención del scroll, controles táctiles de al menos 44 px y texto de formulario de 16 px en móvil.
- Timeline usa tarjetas de detalle en agenda móvil; controles de vista/mes accesibles. La vista de todos los pagos oculta el selector de mes para no sugerir un filtro inexistente.
- Review Queue filtra toda la vista en el servidor antes de agrupar/paginar. Mantiene contadores globales, conserva filtros en URL, reinicia página al aplicar filtros y normaliza páginas inválidas. Límite de 25 grupos, sin dividir grupos entre páginas.
- La paginación de Review Queue reduce lo enviado al cliente; el servidor todavía carga el conjunto del engine antes de paginar. No es paginación SQL ni optimización del volumen leído de la base.
- Exportaciones Review Queue se etiquetan como exportaciones de la página actual.
- History mantiene 50 movimientos por página y totales del conjunto filtrado; al paginar desplaza y enfoca el inicio de resultados.
- Reports adapta controles al ancho móvil y restablece su selector al cambiar el mes del reporte; mantiene impresión/PDF y las tarjetas responsive existentes.

## Auth y datos

No se modificaron `lib/supabase/*`, `proxy.ts`, endpoints, cookies ni configuración de Auth. No se añadió service worker, Cache Storage, IndexedDB, localStorage ni caché financiera offline. La sesión mantiene la arquitectura previa; comprobar persistencia y expiración en un iPhone sigue siendo una prueba física pendiente. Los reportes/CSV solo se exportan mediante una acción explícita del usuario.

## Validaciones

- `npm test`: PASS, 54 entradas reportadas, 0 fallos. Incluye regresiones de filtros antes de paginar, límites, grupos y dimensiones de iconos.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS, 0 errores y 6 warnings preexistentes de funciones sin uso en ReviewQueueClient.
- `npm run build`: PASS (Next.js 16.2.11/Turbopack, compilación, TypeScript y generación de rutas). Se permitió la descarga de Google Fonts con telemetría desactivada; sin deploy.
- `git diff --check`: PASS.
- No se ejecutaron acciones autenticadas contra datos reales ni pruebas de dispositivo físico.

## Readiness

Evaluación técnica local: **80/100**. Es una estimación con la siguiente rúbrica; no es un benchmark ni certificación de producción, y no existe una puntuación móvil previa comparable.

| Área | Puntos |
|---|---:|
| Manifest, standalone, metadata e iconos | 15/15 |
| Navegación, controles y safe areas implementados | 15/15 |
| Paginación, filtros y Reports | 20/20 |
| Preservación de auth y ausencia de caché offline añadida | 15/15 |
| Tests, tipos, lint y build local | 15/15 |
| Validación física iPhone / Safari / standalone | 0/20 |

**GO condicionado para una prueba física controlada** cuando exista una URL HTTPS autorizada que sirva estos cambios. No se publicó ni se verificó tal URL durante esta tarea. **NO-GO para declarar la beta validada o lanzarla a producción** antes de cerrar la prueba física.

## Prueba física pendiente

1. Safari en iPhone: instalar con Compartir → Añadir a pantalla de inicio; comprobar icono, título y apertura standalone.
2. Iniciar sesión, cerrar/reabrir standalone y alternar Safari/standalone. Probar expiración y cierre de sesión; verificar que no se accede al contenido protegido después del logout.
3. Revisar notch/home indicator en ambas orientaciones, teclado y zoom en formularios, menú Más, scroll y cierre/restauración de foco en drawers.
4. Timeline: meses, agenda, todos los pagos y detalles sin desbordamiento horizontal.
5. Review Queue: más de 25 grupos, búsqueda de un elemento originalmente en otra página, filtros, siguiente/anterior y retorno desde detalles. No ejecutar `ignore`.
6. History: más de 50 movimientos, filtros y totales consistentes; comprobar foco al paginar.
7. Reports: cambiar mes, leer deudas/cuentas y previsualizar PDF desde iPhone.
8. Desconectar la red: no se promete acceso offline ni se deben confirmar cambios como exitosos sin respuesta del servidor. Reabrir online y comprobar recuperación de sesión.

## Blockers heredados

- Review Queue `ignore`: NO-GO por incompatibilidad de permisos documentada en el checkpoint; no se modificó SQL.
- Configuración legacy: promoción y enlace no atómicos; no usar este flujo en la prueba de aceptación móvil.
- Migration history de producción no reproducible desde el checkpoint; fuera del alcance móvil.
- Deployment que sirva estos cambios, estado de Vercel production y configuración HTTPS de prueba no verificados.
- Validación física de sesión, teclado, safe areas e impresión pendiente.
