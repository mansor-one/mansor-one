import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  loginErrorMessage,
  validateLoginInput,
} from '../lib/auth/login-experience.ts'
import { getSafeRedirectPath } from '../lib/security/safe-redirect.ts'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const login = source('app/login/page.tsx')
const authProxy = source('lib/supabase/proxy.ts')

test('login renders Mansor One branding and an accessible authentication form', () => {
  assert.match(login, /Mansor One/)
  assert.match(login, /Finanzas para el hogar/)
  assert.match(login, /<form[\s\S]*onSubmit=\{login\}/)
  assert.match(login, /htmlFor="email"/)
  assert.match(login, /htmlFor="password"/)
  assert.match(login, /autoComplete="email"/)
  assert.match(login, /autoComplete="current-password"/)
  assert.match(login, /aria-live="polite"/)
  assert.match(login, /aria-invalid=/)
  assert.match(login, /Mostrar contraseña/)
})

test('login validation requires a valid email and a password', () => {
  assert.deepEqual(validateLoginInput('', ''), {
    email: 'Escribe tu correo electrónico.',
    password: 'Escribe tu contraseña.',
  })
  assert.deepEqual(validateLoginInput('persona-a', 'secret'), {
    email: 'Escribe un correo electrónico válido.',
  })
  assert.deepEqual(validateLoginInput(' persona-a@example.com ', 'secret'), {})
})

test('login prevents duplicate submits and exposes a loading state', () => {
  assert.match(login, /if \(submittingRef\.current\) return/)
  assert.match(login, /submittingRef\.current = true/)
  assert.match(login, /disabled=\{submitting\}/)
  assert.match(login, /Iniciando sesión\.\.\./)
})

test('Supabase authentication errors are translated without technical details', () => {
  assert.equal(
    loginErrorMessage({
      name: 'AuthApiError',
      code: 'invalid_credentials',
      message: 'Invalid login credentials',
      status: 400,
    }),
    'Correo o contraseña incorrectos.'
  )
  assert.equal(
    loginErrorMessage({ message: 'Failed to fetch' }),
    'No pudimos conectarnos. Intenta nuevamente.'
  )
  assert.equal(
    loginErrorMessage({ message: 'JWT expired' }),
    'Tu sesión expiró. Inicia sesión nuevamente.'
  )
  assert.doesNotMatch(login, /setMessage\(error\.message\)/)
})

test('login preserves safe post-authentication redirects and rejects external ones', () => {
  assert.match(login, /getSafeRedirectPath\(nextPath\)/)
  assert.match(login, /window\.location\.href = redirectTo/)
  assert.equal(getSafeRedirectPath('/timeline?view=payments'), '/timeline?view=payments')
  assert.equal(getSafeRedirectPath('https://evil.example'), '/')
  assert.equal(getSafeRedirectPath('//evil.example'), '/')
})

test('existing proxy keeps authenticated users out of login and protects private routes', () => {
  assert.match(authProxy, /if \(!claims && !isPublicRoute\(pathname\)\)/)
  assert.match(authProxy, /redirectUrl\.pathname = '\/login'/)
  assert.match(authProxy, /searchParams\.set\([\s\S]*'next'/)
  assert.match(authProxy, /if \(claims && pathname === '\/login'\)/)
  assert.match(authProxy, /getSafeRedirectPath\(next\)/)
})

test('private login does not expose unsupported signup or password recovery actions', () => {
  assert.doesNotMatch(login, /auth\.signUp/)
  assert.doesNotMatch(login, /resetPasswordForEmail/)
  assert.doesNotMatch(login, /Olvidé mi contraseña/)
})
