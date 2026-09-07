# Checkpoint Mansor One — 2026-09-06

Este checkpoint preserva el estado de trabajo y NO representa un migration history reproducible de Supabase production.

## Identidad y alcance

- Branch del checkpoint: `checkpoint/pre-mobile-beta-2026-09-06`.
- Branch de origen: `security/phase-1-hardening`.
- Commit base: `429b82e1fd02999a2951cbfb3888ee4e499f5272` (`429b82e`).
- Mensaje base: `feat: stabilize financial engine, Plaid sync, and login`.
- Origin: `https://github.com/mansor-one/mansor-one.git`.
- `origin/security/phase-1-hardening`: `429b82e`, verificado en GitHub durante la auditoría previa.
- `origin/main`: `97b55815697dc126ad7d2649849761225cca9af7`, merge del PR #3, verificado durante la auditoría previa.
- El commit base está 0 ahead / 2 behind de `origin/main`, pero ambos tienen exactamente el mismo árbol: `43806945a78db595400d8b506da7b9fb62e4a901`.
- La branch `main` local permanece en `990aed2`, 12 commits detrás de `origin/main`.
- Se preservan 147 cambios existentes: 66 modified, 1 deleted y 80 untracked del proyecto. Las nueve migraciones son parte de esos 80, no nueve archivos adicionales.
- Este commit añade además las exclusiones de `.gitignore` y este documento: 149 rutas afectadas en total.
- El checkpoint es local: no autoriza push, deploy, SQL, db push, migration repair ni sincronización del historial.

Los datos de Supabase y Vercel siguientes proceden de la auditoría de solo lectura previa. No se consultaron ni modificaron esos servicios al crear este checkpoint.

## Features preservadas

| Área | Trabajo incluido |
|---|---|
| Account | Perfil, hogar, contraseña, reautenticación, email y menú autenticado. |
| Reports | Reporte mensual, deudas, impresión y guardar PDF. |
| Plaid logos | Metadatos institucionales/comerciales, proxies, caché visual e integración con sync y UI. |
| Review Queue | Corrección imported-only, pruebas de permisos, contexto y paginación. |
| ATH / Gmail | Evidencia normalizada, candidatos, revisión manual, reprocesamiento y tokens cifrados por hogar. |
| Transaction context | Enriquecimientos y sugerencias de evidencia ATH en revisión e historial. |
| Timeline contextual navigation | Enlaces por ID a tarjetas, cuentas y conexiones, foco/edición y regreso a Pagos. |
| Accounts retirement | `/accounts` redirige a `/portfolio`; eliminación de `AccountsClient.tsx`. |
| Obligaciones / motor financiero | Revisión legacy, ranking por proveedor/contexto, batching, promoción previa al enlace y recurrencia cada 14 días. |
| Mobile/PWA | WORK IN PROGRESS: manifest, iconos, navegación inferior, safe areas, drawers, paginación y presentación móvil. Sin service worker. No es una Mobile Beta terminada. |
| Documentación/tests | Arquitectura, retiro legacy, configuración Gmail y cobertura de las features. |

Los cambios de varias features comparten archivos. Este snapshot integral preserva esas dependencias sin reordenar ni reescribir implementación o migraciones.

## Mapa de las nueve migraciones locales a Supabase

Proyecto auditado: `byjftcabsvaanswbmtzp`, coincidente con el enlace local.
Todos los archivos de esta tabla estaban sin seguimiento y ausentes de las puntas GitHub auditadas antes del checkpoint.

| Archivo en `supabase/migrations/` | Estado remoto observado |
|---|---|
| `20260729031323_ath_movil_evidence_candidates.sql` | Registrado como `20260729031323`; SQL equivalente al normalizar comentarios y formato. |
| `20260802232850_ath_movil_minimum_privileges.sql` | Registrado como `20260802232850`; SQL equivalente. |
| `20260802233136_ath_movil_evidence_foreign_key_indexes.sql` | Registrado como `20260802233136`; SQL equivalente. |
| `20260815120000_transaction_context_phase_1a.sql` | Registrado con timestamp distinto: `20260815191938`, nombre remoto `20260815120000_transaction_context_phase_1a`; SQL equivalente. |
| `20260815190313_transaction_context_service_role_minimum_privileges.sql` | Registrado con timestamp distinto: `20260815192015`, nombre remoto `20260815190313_transaction_context_service_role_minimum_privileges`; SQL equivalente. |
| `20260815192135_plaid_logos_phase_1.sql` | Aplicado dentro de `20260815195739_plaid_logos_phase_1_atomic_schema_and_authenticated_write_privileges`; no equivale exactamente al SQL local. |
| `20260815195007_plaid_logos_authenticated_write_privileges.sql` | Integrado en esa misma migración remota combinada `20260815195739`. |
| `20260815203000_account_phase_1a_minimum_privileges.sql` | Registrado con timestamp distinto: `20260816024930`, nombre remoto `account_phase_1a_minimum_privileges`; SQL equivalente. |
| `20260816150605_confirm_review_transaction_imported_only.sql` | Sin entrada en migration history; la definición activa de `public.confirm_review_transaction` ya contiene la corrección imported-only de promoción normal. |

La ausencia de una entrada no demuestra ausencia de aplicación. El historial tampoco identifica por sí solo la herramienta utilizada para aplicar SQL. No ejecutar a ciegas estos archivos como migraciones pendientes: hay identidades diferentes, una aplicación combinada y cambios fuera del historial.

### Diferencias de Plaid Logos

- Producción incluye `plaid_imports_merchant_logo_https_check`, que exige URLs HTTPS; el archivo local de esquema no lo contiene.
- El índice activo `plaid_connections_institution_id_idx` es completo; el local propone un índice parcial con `WHERE institution_id IS NOT NULL`.
- La migración remota combina esquema y permisos en una transacción, con `DROP CONSTRAINT IF EXISTS` y `CREATE TABLE IF NOT EXISTS`; el archivo local tiene diferencias de idempotencia y comentarios de objetos.
- Preservar estos archivos no significa que reproduzcan exactamente producción. La normalización queda pendiente de un cambio separado autorizado.

### Drift adicional ya existente en Git

`20260731005138_plaid_reconciliation_events_service_role_privileges.sql` ya estaba versionado en el commit base, pero no aparece en el historial remoto. Los permisos activos comprobados sobre `obligation_reconciliation_events` sí coinciden con el contrato local: `service_role` tiene SELECT e INSERT, sin UPDATE. No se reparó el historial.

## Limitaciones y NO-GO

- **Review Queue ignore: NO-GO.** La rama `ignore` de la función activa modifica `imported`, `transaction_status` y `updated_at`, mientras `authenticated` solo tiene UPDATE sobre `imported`. La corrección de promoción normal no resuelve esta rama. No se ejecutó la acción contra datos reales durante la auditoría.
- **Configuración legacy: promoción/enlace todavía no atómica.** La promoción Plaid y `configure_legacy_paid_obligation` son operaciones separadas. Si falla el enlace, puede persistir una transacción confirmada sin el vínculo esperado.
- **Mobile/PWA: WORK IN PROGRESS.** Las verificaciones locales no sustituyen validación autenticada en dispositivos ni autorizan lanzar la beta.
- **Vercel production no verificado.** GitHub reportó un deployment exitoso asociado a `97b5581`, pero la consulta previa al estado de producción devolvió HTTP 403. No se conoce con certeza el deployment activo ni se verificó paridad de variables de entorno.
- No se verificó paridad completa de esquema, datos y configuración entre todos los entornos. No se reescribieron migraciones históricas.

## Exclusiones

Permanecen en disco, fuera del commit:

- `iPad_Fall_2022_26.6_23G71_Restore.ipsw`
- `iPad_Fall_2022_26.6_23G71_Restore.ipsw.lock`
- `restore_1786899214.log`
- `restore_1786899904.log`

`.gitignore` añade `*.ipsw`, `*.ipsw.lock` y `restore_*.log`. No se ignoran globalmente los lockfiles de dependencias. Los archivos `.env*`, `.vercel`, `node_modules`, `.next` y los artefactos TypeScript permanecen excluidos según las reglas existentes.

## Validación del checkpoint

- `npm test`: PASS, 54 entradas de prueba reportadas por el runner, 0 fallos.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS, 0 errores y 6 warnings preexistentes de funciones sin uso en `app/lab/review-queue/ReviewQueueClient.tsx`.
- `npm run build`: PASS. El primer intento en sandbox falló exclusivamente al descargar Geist y Geist Mono de Google Fonts. El reintento con acceso de red completó compilación, TypeScript y generación de rutas. Telemetría desactivada con `NEXT_TELEMETRY_DISABLED=1`; no se ejecutó deploy.
- `git diff --check`: PASS sobre el worktree. La revisión adicional de los archivos nuevos mediante `git diff --cached --check` detectó una línea vacía adicional al final de `lib/transaction-intelligence/ath-evidence-eligibility.ts:42`. Se preservó deliberadamente el archivo original; el diff completo del checkpoint conserva esta advertencia de formato y no se declara libre de whitespace warnings.
- Revisión de secretos: sin coincidencias de credenciales locales ni patrones de tokens, claves privadas o credenciales incrustadas en los archivos seleccionados. No se guardaron valores de secretos en este documento.
- Se verificó por SHA-256 que las 147 rutas originales conservan exactamente su contenido o eliminación. Solo se añadieron este documento y las reglas de `.gitignore`.
- Se verificó que los cuatro artefactos excluidos permanecen en disco e ignorados.
- Los resultados corresponden a validación local; no constituyen pruebas autenticadas de producción ni resuelven los NO-GO anteriores.

## Inventario exacto de los 147 cambios preservados

`D` indica la eliminación preservada; `M` indica archivo previamente tracked modificado; `A` indica archivo nuevo del proyecto. A este inventario se añaden `.gitignore` y `docs/project/CHECKPOINT_2026-09-06.md`.

```text
D app/accounts/AccountsClient.tsx
M app/accounts/page.tsx
M app/api/auth/google/callback/route.ts
M app/api/gmail/ath-import/route.ts
M app/api/gmail/ath-parse/route.ts
M app/api/gmail/test/route.ts
M app/api/obligations/[id]/details/route.ts
M app/api/obligations/configuration/route.ts
M app/api/obligations/configure-legacy/route.ts
M app/api/plaid/sync-accounts/route.ts
M app/api/plaid/sync-imports/route.ts
M app/ath-movil/page.tsx
M app/cards/CardsClient.tsx
M app/cards/page.tsx
M app/components/AppShell.tsx
M app/components/AuthenticatedUserMenu.tsx
M app/components/ConfigureLegacyObligation.tsx
M app/components/ExplainableInsight.tsx
M app/components/FinancialHealthDrawer.tsx
M app/components/FinancialObligationDrawer.tsx
M app/components/InstitutionLogo.tsx
M app/components/PaymentScheduleView.tsx
M app/components/PrimaryNav.tsx
M app/components/ReviewQueuePage.tsx
M app/globals.css
M app/history/HistoryClient.tsx
M app/history/page.tsx
M app/lab/review-queue/ActionableTransactionCard.tsx
M app/lab/review-queue/ReviewQueueClient.tsx
M app/layout.tsx
M app/page.tsx
M app/payments/NeedsConfiguration.tsx
M app/payments/page.tsx
M app/plaid/RepairPlaidConnectionButton.tsx
M app/plaid/page.tsx
M app/portfolio/page.tsx
M data-map.txt
M docs/RLS_MISSING_TABLES.md
M docs/architecture/project-phoenix-legacy-retirement.md
M docs/deployment/vercel-environment-variables.md
M docs/project/ARCHITECTURE_ALIGNMENT.md
M docs/project/CURRENT_STATE.md
M docs/project/OPEN_WORK.md
M docs/project/TECH_DEBT.md
M lib/finance/paymentLifecycle.ts
M lib/financial-engine/cards.ts
M lib/financial-engine/data-health.ts
M lib/financial-engine/index.ts
M lib/financial-engine/ledger-summary.ts
M lib/financial-engine/legacy-obligation-candidates.ts
M lib/financial-engine/legacy-surface-containment.ts
M lib/financial-engine/liquidity.ts
M lib/financial-engine/obligation-configuration.ts
M lib/financial-engine/obligation-reconciliation-engine.ts
M lib/financial-engine/reconciliation.ts
M lib/financial-engine/recurring-cycle-enumerator.ts
M lib/financial-engine/review-queue.ts
M lib/financial-engine/types.ts
M lib/gmail/client.ts
M lib/supabase/database.types.ts
M lib/supabase/proxy.ts
M tests/history-duplicates-theme.test.ts
M tests/obligation-configuration-assistant.test.ts
M tests/obligation-reconciliation.test.ts
M tests/plaid-update-mode.test.ts
M tests/popular-visa-legacy-obligation-migration.test.ts
M tests/recurring-cycle-horizon.test.ts
A ATH_MOVIL_EVIDENCE_ARCHITECTURE.md
A app/account/AccountClient.tsx
A app/account/page.tsx
A app/api/account/email/route.ts
A app/api/account/household/route.ts
A app/api/account/password/reauthenticate/route.ts
A app/api/account/password/route.ts
A app/api/account/profile/route.ts
A app/api/ath-movil/candidates/[id]/decision/route.ts
A app/api/gmail/ath-reprocess/route.ts
A app/api/plaid/assets/institutions/[institutionId]/route.ts
A app/api/plaid/assets/merchants/[plaidImportId]/route.ts
A app/api/transactions/ath-evidence/route.ts
A app/ath-movil/AthGmailActions.tsx
A app/ath-movil/AthReviewList.tsx
A app/components/ContextualEntityTarget.tsx
A app/components/MerchantLogo.tsx
A app/components/MobileNavigation.tsx
A app/history/AthEvidencePanel.tsx
A app/manifest.ts
A app/repair-center/obligation-review/LegacyObligationReviewPreview.tsx
A app/repair-center/obligation-review/page.tsx
A app/reports/ReportActions.tsx
A app/reports/page.tsx
A lib/ath-movil/candidate-store.ts
A lib/ath-movil/evidence-loader.ts
A lib/ath-movil/gmail-mime.ts
A lib/ath-movil/matcher.ts
A lib/ath-movil/parser.ts
A lib/ath-movil/review.ts
A lib/ath-movil/schema-availability.ts
A lib/ath-movil/types.ts
A lib/auth/account-security.ts
A lib/batching.ts
A lib/financial-engine/legacy-obligation-plaid-sources.ts
A lib/financial-engine/legacy-obligation-promotion.ts
A lib/financial-engine/legacy-obligation-review.ts
A lib/financial-engine/monthly-report.ts
A lib/financial-engine/obligation-match-aliases.ts
A lib/financial-engine/review-queue-pagination.ts
A lib/gmail/token-crypto.ts
A lib/gmail/token-store.ts
A lib/plaid/institution-metadata.ts
A lib/plaid/logo-load-state.ts
A lib/plaid/logo-proxy.ts
A lib/plaid/visual-metadata.ts
A lib/transaction-intelligence/ath-context-interpreter.ts
A lib/transaction-intelligence/ath-evidence-eligibility.ts
A lib/transaction-intelligence/context-batching.ts
A lib/transaction-intelligence/context-loader.ts
A lib/transaction-intelligence/context-store.ts
A lib/transaction-intelligence/context-types.ts
A public/icons/apple-touch-icon.png
A public/icons/mansor-1024.png
A public/icons/mansor-192.png
A public/icons/mansor-512.png
A public/icons/mansor-maskable-512.png
A public/icons/mansor-master.svg
A supabase/migrations/20260729031323_ath_movil_evidence_candidates.sql
A supabase/migrations/20260802232850_ath_movil_minimum_privileges.sql
A supabase/migrations/20260802233136_ath_movil_evidence_foreign_key_indexes.sql
A supabase/migrations/20260815120000_transaction_context_phase_1a.sql
A supabase/migrations/20260815190313_transaction_context_service_role_minimum_privileges.sql
A supabase/migrations/20260815192135_plaid_logos_phase_1.sql
A supabase/migrations/20260815195007_plaid_logos_authenticated_write_privileges.sql
A supabase/migrations/20260815203000_account_phase_1a_minimum_privileges.sql
A supabase/migrations/20260816150605_confirm_review_transaction_imported_only.sql
A tests/account-phase-1a.test.ts
A tests/accounts-retirement.test.ts
A tests/ath-movil-evidence.test.ts
A tests/ath-movil-review.test.ts
A tests/biweekly-payment-lifecycle.test.ts
A tests/configure-legacy-batching.test.ts
A tests/legacy-obligation-review-preview.test.ts
A tests/mobile-pwa-v01.test.ts
A tests/monthly-report.test.ts
A tests/plaid-logos-phase-1.test.ts
A tests/review-queue-imported-only-privilege.test.ts
A tests/timeline-contextual-navigation.test.ts
A tests/transaction-context-phase-1a.test.ts
```
