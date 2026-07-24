import fs from 'node:fs'

const checks = []

function read(path) {
  return fs.readFileSync(path, 'utf8')
}

function check(name, condition) {
  checks.push({ name, passed: Boolean(condition) })
}

const proxy = read('lib/supabase/proxy.ts')
check(
  'Proxy applies centralized internal tool path guard',
  proxy.includes('internalToolSurfaceForPath') &&
    proxy.includes('evaluateInternalToolAccess')
)

const internalTools = read('lib/auth/internal-tools.ts')
check(
  'Internal tool helper blocks dev tools in production',
  internalTools.includes("surface === 'lab'") &&
    internalTools.includes('tools are disabled in production') &&
    internalTools.includes('MANSOR_INTERNAL_ADMIN_EMAILS')
)

for (const path of [
  'app/api/dev/transaction-intelligence/generate-plaid-suggestions/route.ts',
  'app/api/dev/transaction-intelligence/recategorize-plaid-suggestions/route.ts',
]) {
  const source = read(path)
  check(
    `${path} requires internal dev access`,
    source.includes('requireInternalToolAccess') && source.includes("'dev'")
  )
}

for (const path of [
  'app/api/gmail/test/route.ts',
  'app/api/gmail/ath-parse/route.ts',
]) {
  const source = read(path)
  check(
    `${path} requires Gmail diagnostic access`,
    source.includes('requireInternalToolAccess') &&
      source.includes("'gmail_diagnostic'")
  )
}

const googleCallback = read('app/api/auth/google/callback/route.ts')
const tokenLogPattern =
  /console\.(log|warn|error)\([^)]*(GOOGLE TOKENS|tokens|access_token|refresh_token)/i
check('Google callback does not log token payloads', !tokenLogPattern.test(googleCallback))
check(
  'Google callback no longer instructs token copy from terminal',
  !googleCallback.includes('Check terminal for tokens')
)

const failed = checks.filter((item) => !item.passed)

for (const item of checks) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`)
}

if (failed.length > 0) {
  process.exitCode = 1
}
