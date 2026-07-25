import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const userMenu = source('app/components/AuthenticatedUserMenu.tsx')
const primaryNav = source('app/components/PrimaryNav.tsx')
const login = source('app/login/page.tsx')
const authProxy = source('lib/supabase/proxy.ts')

test('authenticated user menu exposes an accessible Sign Out action', () => {
  assert.match(primaryNav, /<AuthenticatedUserMenu \/>/)
  assert.match(userMenu, /aria-haspopup="menu"/)
  assert.match(userMenu, /role="menu"/)
  assert.match(userMenu, /Cerrar sesión/)
  assert.match(userMenu, /disabled=\{signingOut\}/)
})

test('Sign Out uses Supabase global logout and clears client navigation state', () => {
  assert.match(
    userMenu,
    /supabase\.auth\.signOut\(\{[\s\S]*scope: 'global'/
  )
  assert.match(userMenu, /window\.location\.replace\('\/login'\)/)
  assert.doesNotMatch(userMenu, /router\.push/)
  assert.doesNotMatch(userMenu, /localStorage\.clear|sessionStorage\.clear/)
})

test('authenticated responses cannot restore sensitive pages from browser cache', () => {
  assert.match(
    authProxy,
    /private, no-store, no-cache, max-age=0, must-revalidate/
  )
  assert.match(authProxy, /Pragma', 'no-cache'/)
  assert.match(authProxy, /if \(!claims && !isPublicRoute\(pathname\)\)/)
})

test('login remains available after logout for a new authenticated session', () => {
  assert.match(login, /supabase\.auth\.signInWithPassword/)
  assert.match(login, /window\.location\.href = redirectTo/)
  assert.match(authProxy, /if \(claims && pathname === '\/login'\)/)
  assert.match(authProxy, /getSafeRedirectPath\(next\)/)
})
