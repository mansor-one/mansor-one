import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ALLOWED_FILES = new Set([
  'app/advisor/page.tsx',
  'app/api/pablo/answer/route.ts',
  'app/pablo-chat/page.tsx',
  'scripts/check-legacy-advisor-usage.mjs',
])

const DEFAULT_SEARCH_ROOTS = ['app', 'lib', 'scripts']
const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
])

const IGNORED_FILE_SUFFIXES = ['.map', '.min.js']

const CHECKS = [
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

function normalizePath(filePath) {
  return path.normalize(filePath).replaceAll(path.sep, '/')
}

function isProbablyText(buffer) {
  if (buffer.length === 0) return true
  return !buffer.includes(0)
}

function shouldScanFile(filePath) {
  return !IGNORED_FILE_SUFFIXES.some((suffix) => filePath.endsWith(suffix))
}

function walkFiles(rootPath) {
  const entries = fs.readdirSync(rootPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name)

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        files.push(...walkFiles(entryPath))
      }
      continue
    }

    if (entry.isFile() && shouldScanFile(entryPath)) {
      files.push(entryPath)
    }
  }

  return files
}

function findMatches({ check, filePath, cwd }) {
  const buffer = fs.readFileSync(filePath)

  if (!isProbablyText(buffer)) {
    return []
  }

  const regex = new RegExp(check.pattern)
  const relativePath = normalizePath(path.relative(cwd, filePath))
  const lines = buffer.toString('utf8').split(/\r?\n/)
  const matches = []

  lines.forEach((line, index) => {
    if (regex.test(line)) {
      matches.push(`${relativePath}:${index + 1}:${line}`)
    }
  })

  return matches
}

export function scanLegacyAdvisorUsage({
  cwd = process.cwd(),
  searchRoots = DEFAULT_SEARCH_ROOTS,
  allowedFiles = DEFAULT_ALLOWED_FILES,
} = {}) {
  const allowed = new Set([...allowedFiles].map(normalizePath))
  const violationsByCheck = []

  for (const check of CHECKS) {
    const violations = []

    for (const root of searchRoots) {
      const rootPath = path.resolve(cwd, root)
      const files = walkFiles(rootPath)

      for (const filePath of files) {
        const relativePath = normalizePath(path.relative(cwd, filePath))

        if (!allowed.has(relativePath)) {
          violations.push(...findMatches({ check, filePath, cwd }))
        }
      }
    }

    if (violations.length > 0) {
      violationsByCheck.push({ check, violations })
    }
  }

  return violationsByCheck
}

function main() {
  const violationsByCheck = scanLegacyAdvisorUsage()

  for (const { check, violations } of violationsByCheck) {
    console.error(`\nUnexpected ${check.label} usage:`)
    for (const violation of violations) {
      console.error(`  ${violation}`)
    }
  }

  if (violationsByCheck.length > 0) {
    process.exit(1)
  }

  console.log('No unexpected legacy advisor usage found.')
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    main()
  } catch (error) {
    console.error(
      `Legacy advisor usage guard failed unexpectedly: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    process.exit(1)
  }
}
