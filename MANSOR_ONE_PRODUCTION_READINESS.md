# Mansor One — Auditoría de preparación para producción

**Fecha de corte:** 20 de julio de 2026  
**Rama auditada:** `feature/transaction-review-center` (`39b5dfa`) más cambios locales preexistentes  
**Alcance:** seguridad, autenticación, autorización/RLS, arquitectura, base de datos, rendimiento, despliegue, PWA y experiencia móvil.  
**Restricciones:** auditoría de solo lectura; no se añadieron funciones, no se cambiaron cálculos y no se modificaron datos de producción.

## Veredicto ejecutivo

**Mansor One no está listo para una versión 1.0 pública o multiusuario.** El producto tiene una base funcional sólida —compila para producción, pasa TypeScript, pruebas y `git diff --check`, centraliza autenticación de páginas y contiene reglas financieras e idempotencia cubiertas por pruebas—, pero mantiene bloqueadores de aislamiento de datos en la base de producción.

El principal riesgo no es que RLS esté apagado: todas las tablas públicas inspeccionadas lo tienen activado. El problema es que varias políticas usan `USING (true)`/`WITH CHECK (true)` o incluyen `anon`, permitiendo leer o modificar registros financieros sin limitar por propietario. Antes de v1.0 deben corregirse y probarse esas políticas con dos usuarios distintos.

También faltan controles operacionales indispensables: endurecimiento HTTP, protección explícita de mutaciones, observabilidad, una canalización de despliegue repetible, pruebas E2E y móviles, configuración documentada del cron, y una estrategia PWA real.

### Estado por área

| Área | Estado | Conclusión |
| --- | --- | --- |
| Seguridad y RLS | Bloqueada | Hay lectura anónima y acceso transversal a datos financieros; algunas tablas permiten escrituras globales a cualquier usuario autenticado. |
| Autenticación | Parcial | La sesión principal usa `getUser()` y las API financieras verifican usuario, pero OAuth de Google está incompleto y faltan defensas de abuso/CSRF. |
| Arquitectura | Parcial | El Financial Engine y los límites servidor/cliente son razonables; persisten acoplamiento, consultas duplicadas y uso amplio de `service_role`. |
| Base de datos | Bloqueada | Buen uso de RLS e índices en partes nuevas, pero políticas heredadas, deriva de contratos y avisos del asesor impiden certificar aislamiento. |
| Rendimiento | Parcial | Build rápido y consultas paralelas, pero el Dashboard repite agregaciones y no hay medición de rendimiento real ni presupuesto de bundles. |
| Despliegue | Bloqueada | Build exitoso, pero faltan CI/CD, observabilidad, runbook completo y configuración verificada del cron/secrets. |
| PWA | No preparada | No hay manifest, service worker, iconografía instalable ni experiencia offline. |
| Móvil y accesibilidad | Parcial | Hay diseño responsive y semántica básica; faltan pruebas reales, foco robusto en drawers y objetivos táctiles consistentes. |

## Metodología y evidencia

- Revisión estática de rutas App Router, proxy de sesión, utilidades Supabase, acciones de servidor y handlers API.
- Inspección en vivo y de solo lectura del proyecto Supabase `byjftcabsvaanswbmtzp`: RLS, políticas, grants, asesores de seguridad/rendimiento, funciones y Storage.
- Revisión de configuración Next.js/Vercel, variables esperadas, cron, dependencias, PWA y componentes responsive.
- Validación local: build de producción, TypeScript, ESLint, pruebas y `git diff --check`.
- No se realizó una prueba autenticada contra un deployment, pentest externo, Lighthouse en dispositivo, restauración de backup ni ejecución de migraciones.

Referencias del criterio de seguridad: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Hardening the Data API](https://supabase.com/docs/guides/database/secure-data) y [Password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Hallazgos críticos

### C-01 — RLS permite exposición anónima de datos financieros

**Evidencia:** las políticas vigentes permiten `SELECT` con condición `true` a `anon` o `public` en `assets`, `credit_cards`, `liabilities`, `payment_instances`, `funds`, `goals`, `merchant_rules` y `scheduled_payments`. Ejemplos concretos: `Allow authenticated read credit cards` incluye `{anon, authenticated}`; `Allow public read liabilities` aplica a `public`; `Allow authenticated read payment instances` también incluye `anon`.

**Impacto:** un cliente con la clave pública podría enumerar balances, deudas, tarjetas, pagos programados y objetivos sin ser el dueño. RLS activado no mitiga una política que autoriza todas las filas.

**Acción requerida:** retirar accesos anónimos, introducir/normalizar `user_id` o pertenencia de hogar donde falte, y reemplazar políticas globales por predicados de propietario. Verificar desde los roles `anon`, usuario A, usuario B y `service_role`. No liberar hasta demostrar cero lectura cruzada.

### C-02 — Usuarios autenticados pueden modificar datos financieros ajenos

**Evidencia:** `ath_movil_messages`, `financial_links`, `future_obligations`, `payment_instances` y `priorities` tienen políticas de `INSERT`, `UPDATE` o `ALL` con `USING (true)` y/o `WITH CHECK (true)`. El asesor de seguridad de Supabase las reporta como `rls_policy_always_true`.

**Impacto:** cualquier cuenta autenticada podría alterar estados de pago, enlaces de reconciliación, obligaciones futuras, prioridades o mensajes ATH de otra persona. Esto compromete integridad financiera, no solo confidencialidad.

**Acción requerida:** políticas owner/household-scoped para cada operación, columnas `user_id` no nulas cuando corresponda, restricciones de FK y pruebas negativas. Limitar escrituras privilegiadas a funciones/servidor estrictamente necesarias.

### C-03 — No existe una certificación multiusuario de aislamiento

**Evidencia:** las 13 pruebas actuales son unitarias/estáticas y no ejercitan la base con `anon`, dos sesiones autenticadas y `service_role`. Las políticas problemáticas coexistieron con políticas correctas como `credit_cards_select_own`; al ser permisivas, la política global gana por OR.

**Impacto:** una corrección parcial puede aparentar seguridad sin cerrar el acceso efectivo. Los cálculos y pruebas funcionales no detectan fuga entre hogares.

**Acción requerida:** añadir una matriz automatizada de RLS por tabla y operación, ejecutada sobre una base efímera o staging restaurable. La prueba debe fallar si A puede leer/escribir B o si `anon` obtiene filas financieras.

## Hallazgos altos

### A-01 — OAuth de Google no tiene `state`/PKCE ni vínculo verificable con sesión

`/api/auth/google/start` y `/api/auth/google/callback` inician/intercambian el código sin `state`, PKCE ni asociación persistida con el usuario. El callback descarta los tokens y la integración Gmail depende de un refresh token de entorno.

**Riesgo:** confusión de cuenta/OAuth CSRF y un flujo de producción incompleto. **Acción:** deshabilitar estas rutas en producción hasta implementar el protocolo completo, o completar `state` de un solo uso, PKCE, sesión, almacenamiento cifrado y revocación.

### A-02 — Faltan cabeceras de seguridad y política CSP

`next.config.ts` no configura CSP, HSTS, `frame-ancestors`, `X-Content-Type-Options`, Referrer Policy ni Permissions Policy.

**Acción:** definirlas en Next/Vercel, probar login/Plaid/Google y evitar `unsafe-inline` salvo excepción documentada. Activar HSTS únicamente después de validar HTTPS y subdominios.

### A-03 — Mutaciones cookie-auth sin defensa explícita uniforme

Las API financieras autentican al usuario, lo cual es positivo, pero no hay capa común de comprobación de `Origin`, token CSRF o rate limit. Existen además redirects posteriores a POST en `category-conflict` y `duplicate-resolution` construidos desde `redirectTo` sin la validación de ruta local que sí usa el login.

**Acción:** centralizar guards de método/origen/content-type, aplicar límites por usuario/IP y validar redirects internos. Priorizar importaciones, reconciliación, Plaid y Robototina.

### A-04 — Preview puede exponer herramientas internas a cualquier usuario autenticado

En preview, una lista vacía de `MANSOR_INTERNAL_ADMIN_EMAILS` permite acceso a superficies internas para cualquier usuario autenticado. En producción `/dev` queda bloqueado y `/lab` requiere opt-in, pero el preview puede apuntar a datos sensibles.

**Acción:** hacer deny-by-default también en preview compartido, exigir allowlist no vacía y separar Supabase/Plaid de preview y producción.

### A-05 — Falta observabilidad operacional y respuesta a incidentes

No se encontró integración de errores/trazas, métricas, alertas, endpoint de readiness ni runbook de incidentes. Los logs de funciones no sustituyen alertas sobre fallos de sync, reconciliación, auth o base.

**Acción:** instrumentar errores con redacción de PII, correlation IDs, métricas de sync y alertas; documentar rotación de secretos, degradación de Plaid, revocación y recuperación.

### A-06 — Despliegue diario Plaid no está completamente operacionalizado

`vercel.json` programa `/api/plaid/sync/daily`, pero `CRON_SECRET` no está incluido en el inventario de variables y no aparece en el entorno local auditado. El endpoint falla cerrado si falta, lo cual es seguro, pero deja el proceso inoperante. El job enumera usuarios y usa trabajo posterior a la respuesta; su duración y escalado dependen de límites serverless.

**Acción:** documentar/configurar el secreto, verificar firma de Vercel Cron, límites de duración y reintentos, y ejecutar una prueba de fallo parcial en staging. Para crecimiento multiusuario, usar cola por usuario en lugar de un único fan-out.

### A-07 — No hay pipeline CI/CD ni gates reproducibles observables

No se encontró workflow de CI en el repositorio. El build local pasa, pero no existe evidencia de un gate obligatorio para build, tipos, lint, pruebas, auditoría de dependencias, migraciones y preview antes de producción.

**Acción:** crear un pipeline con Node fijado, instalación reproducible, checks obligatorios, ambiente de staging y aprobación de migraciones. Prohibir deploy si el árbol/commit no corresponde al artefacto validado.

### A-08 — PWA no implementada

No hay web app manifest, service worker, iconos de instalación, `theme_color`, estrategia de caché, fallback offline ni pruebas de actualización. Los SVG de ejemplo de Next no constituyen assets PWA.

**Acción:** decidir explícitamente si “PWA instalable” es requisito de v1.0. Si lo es, este hallazgo bloquea release: implementar manifest e iconos, una estrategia conservadora que nunca cachee respuestas financieras privadas y pruebas de actualización/offline. Si no lo es, retirar la promesa PWA de v1.0 y mantener una web móvil responsive.

### A-09 — Cobertura de pruebas insuficiente para un producto financiero

Las 13 pruebas actuales pasan y cubren reglas valiosas, pero no hay E2E autenticado, contratos contra Supabase, restauración/migración, concurrencia, regresión visual, accesibilidad automatizada ni navegador móvil.

**Acción:** cubrir login/logout/expiración, aislamiento RLS, Plaid idempotente, Review Queue, reconciliación, Dashboard/Cash Flow/Timeline, y smoke en iOS Safari/Android Chrome.

## Hallazgos medios

### M-01 — Políticas y grants tienen deriva y costo innecesario

El asesor reporta políticas permisivas duplicadas y políticas owner-scoped declaradas para `public`. Varias usan `auth.uid()` directamente en vez de una forma inicializada una vez por consulta. También existen tablas con RLS y cero políticas, entre ellas `transactions`, `raw_transactions`, `plaid_items`, `statement_imports` y otras tablas heredadas.

**Acción:** mantener una sola política por rol/operación cuando sea posible, restringir roles, optimizar predicados y clasificar cada tabla sin política como “solo servidor”, “retirada” o “requiere acceso de usuario”.

### M-02 — Índices y plan de consultas requieren una pasada dirigida

El asesor de rendimiento reporta foreign keys sin índice, índices nunca usados y políticas múltiples. “Nunca usado” no justifica borrado automático —puede ser un índice nuevo o de baja frecuencia—, pero las FK sin índice pueden degradar joins, cascadas y limpieza.

**Acción:** medir con `pg_stat_statements`/planes de staging, indexar FK y filtros calientes (`user_id`, estado, fechas, source IDs) basándose en consultas reales, y revisar índices solo tras un periodo representativo.

### M-03 — Dashboard repite lecturas y agregaciones

La página carga varios resúmenes en paralelo, pero Robototina vuelve a construir un snapshot financiero amplio. Esto duplica lecturas y cálculo dentro de una misma visita.

**Acción:** compartir un snapshot por request o introducir caché por usuario con invalidación explícita después de sync/mutaciones. Medir antes y después; no cambiar fórmulas.

### M-04 — Uso de `service_role` amplía el radio de error

Los procesos de servidor lo necesitan para orquestación, pero esa credencial omite RLS. Cada consulta debe aplicar `user_id` correctamente; una omisión se convierte en fuga transversal.

**Acción:** reservarlo para jobs administrativos, preferir el cliente ligado a sesión en solicitudes de usuario y añadir assertions de scope/revisión estática para consultas privilegiadas.

### M-05 — Tipado de base manual y riesgo de deriva de esquema

Se observan `Record<string, unknown>`, casts y contratos manuales en vez de tipos generados desde el esquema. El repositorio tampoco muestra un gate de drift entre migraciones y producción.

**Acción:** generar tipos en CI, validar migraciones sobre una base limpia y comparar versión de esquema antes del deploy.

### M-06 — Dependencia vulnerable moderada en la cadena de build

`npm audit --omit=dev` reportó 2 vulnerabilidades moderadas: `postcss < 8.5.10` incluido por Next, con advisory de XSS al serializar `</style>`, y el paquete `next` afectado por esa dependencia. La sugerencia automática de npm propone una versión incorrecta/antigua y no debe aplicarse a ciegas.

**Acción:** seguir el advisory `GHSA-qx2v-qp2m-jg93`, actualizar Next cuando exista una versión compatible que incorpore PostCSS corregido y añadir auditoría continua con evaluación de explotabilidad.

### M-07 — Protección de contraseñas filtradas no está habilitada

El asesor de Supabase indica que leaked-password protection está desactivado.

**Acción:** habilitarla, definir longitud/política de contraseña, revisar expiración de sesión y evaluar MFA para administradores antes de una apertura amplia.

### M-08 — No se verificó estrategia de backup/restauración

La revisión no pudo demostrar PITR, retención, RPO/RTO ni una restauración ensayada. No se debe inferir que no existan; falta evidencia operativa.

**Acción:** registrar plan/retención, exportación segura, responsables y simulacro de restore en staging antes de v1.0.

### M-09 — UX móvil de drawers y menús necesita endurecimiento accesible

La interfaz usa grids responsive, navegación móvil, badges con texto/icono y tablas desplazables. Sin embargo, no se encontró evidencia consistente de focus trap, retorno de foco, bloqueo de scroll y escape en todos los drawers; varios controles compactos pueden quedar por debajo de 44×44 px.

**Acción:** auditoría con teclado y lector de pantalla, objetivos táctiles mínimos, safe areas, zoom de texto al 200 %, orientación y viewport estrecho. Probar datos largos y teclado virtual.

### M-10 — Fuentes externas crean dependencia de red en build

El layout usa `next/font` con Google. Aunque el build auditado completó, un entorno de CI restringido puede fallar al descargar las fuentes.

**Acción:** hospedar fuentes localmente o garantizar caché/red reproducible en CI.

### M-11 — Storage no tiene superficie activa, pero debe mantenerse explícito

No existen buckets ni políticas de Storage en el proyecto auditado. Esto reduce superficie hoy.

**Acción:** si se habilitan estados de cuenta/adjuntos, exigir buckets privados, paths por usuario, MIME/tamaño, URLs firmadas y pruebas RLS antes de activarlos.

## Hallazgos bajos

### B-01 — ESLint pasa con seis advertencias

Todas están en `app/lab/review-queue/ReviewQueueClient.tsx` por funciones/componentes no usados. No bloquean el build, pero ocultan ruido futuro.

### B-02 — Rutas diagnósticas y superficies heredadas aumentan exposición

`/api/gmail/ath-test` devuelve solo una instrucción estática y `/api/pablo/answer` responde 410, pero siguen formando parte del artefacto. Las rutas `/dev`, `/lab`, `/advisor-v2`, `/pablo-chat` y otras superficies experimentales deben tener una decisión explícita de producción.

### B-03 — No hay páginas de error/loading específicas observables

El build incluye `_not-found`, pero no se encontraron boundaries dedicados de error/carga. La aplicación dependerá de estados genéricos durante fallos o latencia.

### B-04 — Assets públicos son todavía los placeholders de Next

`public/` contiene los SVG predeterminados; falta una identidad de instalación/compartición consistente, aunque esto no afecta los cálculos financieros.

### B-05 — Versiones declaradas con rangos amplios

El lockfile hace la instalación actual reproducible, pero los rangos `^` pueden cambiar al regenerarlo. Renovaciones de dependencias deben pasar por PR y validación, no por actualización automática directa a producción.

## Evaluación positiva

- Las páginas protegidas pasan por un proxy de sesión y las autorizaciones sensibles usan `auth.getUser()`, no confían solamente en estado local del cliente.
- Las API financieras revisadas llaman guards de usuario o de herramienta interna; los endpoints `/api/dev/*` no quedan abiertos en producción.
- `.env.local` no está versionado y `.gitignore` excluye `.env*`; no se encontraron referencias de secretos de servidor en componentes cliente.
- No se encontraron vistas públicas ni funciones `SECURITY DEFINER` en `public`, reduciendo rutas indirectas de exposición.
- No existen buckets de Storage activos.
- El flujo Plaid nuevo incluye lock, progreso e idempotencia cubiertos por pruebas, aunque todavía requiere validación operacional de cron/staging.
- Build de producción, TypeScript, pruebas y `git diff --check` pasan.
- La UI ya usa muchos patrones responsive, texto además de color, `aria-current`, `aria-expanded` y diálogos etiquetados.

## Plan priorizado hacia v1.0

### P0 — Bloqueadores de seguridad (antes de cualquier usuario externo)

1. Congelar apertura pública y separar preview de producción.
2. Crear una migración RLS revisable que elimine todas las políticas `true`/`anon` sobre datos financieros y aplique ownership/household scope.
3. Añadir pruebas RLS con `anon`, usuario A, usuario B y `service_role`, incluyendo SELECT/INSERT/UPDATE/DELETE.
4. Revisar grants del Data API y retirar privilegios que no correspondan al rol.
5. Deshabilitar Google OAuth incompleto o completarlo con `state`, PKCE y sesión.
6. Rotar credenciales sensibles después de la corrección si el proyecto o las claves públicas estuvieron expuestos fuera del equipo; revisar logs de acceso.

### P1 — Release engineering y defensa en profundidad

7. Añadir CSP y cabeceras de seguridad; validar Plaid/Auth bajo la política final.
8. Centralizar Origin/CSRF, redirects locales y rate limiting para mutaciones y endpoints costosos.
9. Configurar CI obligatoria: install reproducible, lint sin warnings, types, unit/integration, build, RLS, audit y `git diff --check`.
10. Configurar observabilidad, redacción de PII, alertas, health/readiness y runbook de incidentes.
11. Documentar y probar `CRON_SECRET`, ejecución diaria, reintento parcial y límites de runtime en staging.
12. Validar backup/PITR y completar un restore drill con RPO/RTO registrados.
13. Actualizar la cadena Next/PostCSS a una versión corregida y volver a ejecutar auditoría.

### P2 — Fiabilidad, rendimiento y calidad de experiencia

14. Añadir E2E de los flujos financieros centrales y pruebas móviles reales.
15. Medir Dashboard y eliminar snapshots duplicados sin alterar cálculos.
16. Corregir FK sin índice y políticas duplicadas a partir de planes/telemetría.
17. Generar tipos Supabase y añadir verificación de drift/migraciones.
18. Endurecer drawers, navegación de foco, targets táctiles y manejo de errores/carga.
19. Decidir el alcance PWA: implementarla sin cachear datos privados o excluirla explícitamente de v1.0.

### P3 — Limpieza no bloqueante

20. Retirar rutas diagnósticas/experimentales del artefacto público o documentar su gate.
21. Resolver warnings de ESLint, placeholders públicos y política de renovación de dependencias.

## Gates de aprobación para v1.0

La versión 1.0 solo debe aprobarse cuando se cumpla todo lo siguiente:

- [ ] Cero políticas financieras con acceso anónimo o escritura global no justificada.
- [ ] Suite RLS multiusuario verde y revisión manual de grants completada.
- [ ] Google OAuth deshabilitado o asegurado completamente.
- [ ] CSP/cabeceras, rate limits, CSRF/origin y redirects validados.
- [ ] CI obligatoria verde sobre el commit exacto desplegado.
- [ ] Staging aislado, cron Plaid y fallo/reintento probados.
- [ ] Observabilidad, alertas, backup y restore drill operativos.
- [ ] Sin vulnerabilidades críticas/altas; moderadas aceptadas por escrito o corregidas.
- [ ] E2E financiero y pruebas iOS/Android/teclado/lector de pantalla aprobadas.
- [ ] Decisión PWA documentada y coherente con la promesa de producto.
- [ ] Working tree limpio y migraciones aplicadas/verificadas en el orden documentado.

## Resultado de validación de esta auditoría

| Comando/control | Resultado |
| --- | --- |
| `npm run build` | Pasa; 51 páginas generadas/analizadas por Next.js. |
| `npx tsc --noEmit` | Pasa. |
| `npm test` | Pasa: 13/13 pruebas. |
| `npm run lint` | Pasa con 6 warnings, 0 errores. |
| `git diff --check` | Pasa. |
| `npm audit --omit=dev` | Falla por 2 vulnerabilidades moderadas (Next/PostCSS); 0 altas, 0 críticas. |
| Supabase Security Advisor | Bloqueadores por políticas siempre verdaderas y protección de contraseñas filtradas desactivada. |
| Supabase Performance Advisor | Avisos de FK sin índice, índices no usados y múltiples políticas permisivas. |
| Estado Git | No limpio por cambios preexistentes de otros sprints; esta auditoría solo añade este documento. |

## Límites de la conclusión

Este informe evalúa el código y el proyecto Supabase accesibles en la fecha de corte. No certifica infraestructura externa no observable: configuración efectiva de Vercel, DNS/TLS, WAF, secretos remotos, backup contratado, políticas organizacionales, Apple/Android real ni tráfico de producción. Esos puntos permanecen como evidencia requerida, no como afirmaciones de ausencia.
