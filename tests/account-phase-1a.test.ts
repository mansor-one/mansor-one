import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  authAccountError,
  validateEmailChange,
  validatePasswordChange,
} from '../lib/auth/account-security.ts'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const page = source('app/account/page.tsx')
const client = source('app/account/AccountClient.tsx')
const menu = source('app/components/AuthenticatedUserMenu.tsx')
const profileRoute = source('app/api/account/profile/route.ts')
const householdRoute = source('app/api/account/household/route.ts')
const passwordRoute = source('app/api/account/password/route.ts')
const reauthenticateRoute = source('app/api/account/password/reauthenticate/route.ts')
const emailRoute = source('app/api/account/email/route.ts')
const migration = source('supabase/migrations/20260815203000_account_phase_1a_minimum_privileges.sql')

test('account page requires Auth and obtains email only from the Auth user', () => {
  assert.match(page, /await requireUser\(\)/)
  assert.match(page, /currentEmail=\{user\.email/)
  assert.doesNotMatch(page, /select\([^)]*email/)
  assert.doesNotMatch(client, /from\(['"](?:profiles|people)['"]\)/)
})

test('user menu uses authenticated membership and has no hardcoded family identity', () => {
  assert.doesNotMatch(menu, /Manuel &amp; Soraya|Cuenta familiar/)
  assert.match(menu, /from\('household_members'\)/)
  assert.match(menu, /Mi cuenta/)
  assert.match(menu, /Configuración/)
  assert.match(menu, /Seguridad/)
  assert.match(menu, /Cerrar sesión/)
})

test('profile mutation targets only the signed-in member and allowed columns', () => {
  assert.match(profileRoute, /requireMutationOrigin/)
  assert.match(profileRoute, /eq\('auth_user_id', auth\.user\.id\)/)
  assert.match(profileRoute, /update\(\{ name, updated_at:/)
  assert.doesNotMatch(profileRoute, /\b(role|active|household_id|auth_user_id)\s*:/)
})

test('viewer cannot rename a household and household update is row scoped', () => {
  assert.match(householdRoute, /\['owner', 'member'\]\.includes\(membership\.role\)/)
  assert.match(householdRoute, /eq\('id', membership\.household_id\)/)
  assert.match(client, /canWriteHousehold/)
  assert.match(client, /Tu rol es de solo lectura/)
})

test('password flow uses user Auth, current password, and supported nonce reauthentication', () => {
  assert.match(passwordRoute, /supabase\.auth\.updateUser/)
  assert.match(passwordRoute, /current_password: currentPassword/)
  assert.match(passwordRoute, /nonce/)
  assert.match(reauthenticateRoute, /supabase\.auth\.reauthenticate\(\)/)
  assert.doesNotMatch(passwordRoute + reauthenticateRoute, /getSupabaseAdmin|service_role|auth\.admin/)
})

test('email change remains pending and never changes the displayed current email optimistically', () => {
  assert.match(emailRoute, /supabase\.auth\.updateUser\(\{ email: nextEmail \}\)/)
  assert.match(client, /setPendingEmail\(result\.pendingEmail\)/)
  assert.match(client, /result\.status === 'completed'[\s\S]*setCurrentEmail\(result\.currentEmail\)/)
  assert.doesNotMatch(client, /setCurrentEmail\(nextEmail\)/)
  assert.match(client, /El correo actual seguirá visible/)
})

test('minimum privileges exclude sensitive membership columns', () => {
  assert.match(migration, /revoke update on table public\.households from authenticated/i)
  assert.match(migration, /grant update \(name, updated_at\) on table public\.households to authenticated/i)
  assert.match(migration, /grant update \(name, updated_at\) on table public\.household_members to authenticated/i)
  assert.match(migration, /auth_user_id = \(select auth\.uid\(\)\)/i)
  assert.doesNotMatch(migration, /grant update \([^)]*(role|active|household_id|auth_user_id|id)/i)
  for (const financialTable of ['quick_entries', 'plaid_imports', 'obligations', 'payments', 'transaction_categories']) {
    assert.doesNotMatch(migration, new RegExp(`public\\.${financialTable}`, 'i'))
  }
})

test('account validation and safe Auth errors are deterministic', () => {
  assert.deepEqual(validatePasswordChange({
    currentPassword: '', newPassword: 'short', confirmPassword: 'other',
  }), {
    currentPassword: 'Escribe tu contraseña actual.',
    newPassword: 'Usa al menos 8 caracteres.',
    confirmPassword: 'Las contraseñas nuevas no coinciden.',
  })
  assert.equal(validateEmailChange('old@example.com', 'old@example.com'), 'El correo nuevo debe ser diferente al actual.')
  assert.deepEqual(authAccountError({ code: 'reauthentication_needed' }), {
    code: 'reauthentication_required',
    message: 'Por seguridad, confirma tu identidad con el código que Supabase enviará a tu correo.',
  })
  assert.doesNotMatch(JSON.stringify(authAccountError({ message: 'secret technical failure' })), /secret technical failure/)
})
