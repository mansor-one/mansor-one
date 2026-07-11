import { spawnSync } from 'node:child_process'
import path from 'node:path'

const allowedFiles = new Set([
  'app/advisor/page.tsx',
  'app/api/pablo/answer/route.ts',
  'app/pablo-chat/page.tsx',
  'docs/security-audit-2026-06-27.md',
  'docs/architecture/legacy-advisor-retirement.md',
  'docs/architecture/financial-engine-contract.md',
  'docs/architecture/MANSOR_ONE_AI_PLAYBOOK.md',
  'scripts/check-legacy-advisor-usage.mjs',
])

const checks = [
  {
    label: 'retired Pablo library usage',
    pattern:
      "\\blib/pablo\\b|@/lib/pablo|from .*pablo|getFinancialDecisionContext|answerQuestion|\\bbuildRecommendation\\b",
  },
  {
    label: 'retired Decision Engine v0 usage',
    pattern: 'getDecisionEngineResult|decisionEngineResult',
  },
  {
    label: 'legacy advisor route link',
    pattern: "/advisor\\b|href=.*advisor",
  },
  {
    label: 'retired Pablo API or chat route',
    pattern: "/api/pablo/answer|/pablo-chat",
  },
]

let hasViolation = false

for (const check of checks) {
  const result = spawnSync(
    'rg',
    ['-n', check.pattern, 'app', 'lib', 'docs', 'scripts', '--glob', '!node_modules/**', '--glob', '!.next/**'],
    { encoding: 'utf8' }
  )

  if (result.status !== 0 && result.status !== 1) {
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }

  const violations = result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((line) => {
      const filePath = line.slice(0, line.indexOf(':'))
      const normalizedPath = path.normalize(filePath).replaceAll(path.sep, '/')
      return !allowedFiles.has(normalizedPath)
    })

  if (violations.length > 0) {
    hasViolation = true
    console.error(`\nUnexpected ${check.label} usage:`)
    for (const violation of violations) {
      console.error(`  ${violation}`)
    }
  }
}

if (hasViolation) {
  process.exit(1)
}

console.log('No unexpected legacy advisor usage found.')
