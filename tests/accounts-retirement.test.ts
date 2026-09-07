import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const accountsPage = source('app/accounts/page.tsx')
const portfolioPage = source('app/portfolio/page.tsx')
const financialAccounts = source('lib/financial-engine/accounts.ts')
const legacyContainment = source('lib/financial-engine/legacy-surface-containment.ts')

test('/accounts remains protected and redirects server-side to /portfolio', () => {
  assert.match(accountsPage, /await requireUser\(\)/)
  assert.match(accountsPage, /redirect\(['"]\/portfolio['"]\)/)
  assert.ok(
    accountsPage.indexOf('await requireUser()') <
      accountsPage.indexOf("redirect('/portfolio')")
  )
})

test('/accounts bookmark remains routable without rendering the legacy page', () => {
  assert.equal(existsSync(new URL('../app/accounts/page.tsx', import.meta.url)), true)
  assert.equal(
    existsSync(new URL('../app/accounts/AccountsClient.tsx', import.meta.url)),
    false
  )
  assert.doesNotMatch(accountsPage + legacyContainment, /AccountsClient|getLegacyAccountsReport/)
})

test('/accounts performs no legacy account calculations or Plaid account query', () => {
  assert.doesNotMatch(accountsPage, /plaid_accounts|\.from\(['"]accounts['"]\)/)
  assert.doesNotMatch(
    accountsPage,
    /Cash Disponible Plaid|Cash Actual Plaid|Crédito Disponible|Deuda Tarjetas Plaid|Balance Manual|Manual Disponible/
  )
})

test('Portfolio and canonical Financial Engine account helpers remain in place', () => {
  assert.match(portfolioPage, /getPortfolioSummary/)
  assert.match(portfolioPage, /getPortfolioManagementData/)
  assert.match(financialAccounts, /export async function getConnectedAccounts/)
  assert.match(financialAccounts, /export async function getManualAccounts/)
})
