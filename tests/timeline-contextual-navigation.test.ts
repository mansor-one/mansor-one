import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const drawer = source('app/components/FinancialObligationDrawer.tsx')
const detailsRoute = source('app/api/obligations/[id]/details/route.ts')
const cardsPage = source('app/cards/page.tsx')
const cardsClient = source('app/cards/CardsClient.tsx')
const portfolioPage = source('app/portfolio/page.tsx')
const plaidPage = source('app/plaid/page.tsx')
const contextualTarget = source('app/components/ContextualEntityTarget.tsx')

test('Timeline uses canonical IDs in contextual destination links', () => {
  assert.match(drawer, /\/cards\?cardId=\$\{encodeURIComponent\(id\)\}&action=edit&from=timeline/)
  assert.match(drawer, /\/portfolio\?accountId=\$\{encodeURIComponent\(reportedId\)\}&accountSource=\$\{source\}&action=edit&from=timeline/)
  assert.match(drawer, /\/plaid\?connectionId=\$\{encodeURIComponent\(id\)\}&from=timeline/)
  assert.match(drawer, /creditCardId/)
  assert.match(drawer, /plaidAccountId/)
  assert.match(drawer, /connectionId/)
})

test('details resolve the legacy schedule and card by exact IDs before any name fallback', () => {
  assert.match(detailsRoute, /legacyScheduledPaymentId\(obligation\?\.notes\)/)
  assert.match(detailsRoute, /\.eq\('id', scheduledPaymentId\)/)
  assert.match(detailsRoute, /scheduleResult\.data\?\.credit_card_id/)
  assert.match(detailsRoute, /\.eq\('id', scheduleResult\.data\.credit_card_id\)/)
  assert.ok(
    detailsRoute.indexOf(".eq('id', scheduleResult.data.credit_card_id)") <
      detailsRoute.lastIndexOf(".ilike('name', name)")
  )
})

test('card deep links resolve exactly, scroll, highlight and open edit mode', () => {
  assert.match(cardsPage, /card\.manualCreditCardId === requestedCardId \|\| card\.plaidAccountId === requestedCardId/)
  assert.doesNotMatch(cardsPage, /card\.(?:cardDisplayName|issuerName|displayName|institution) === requestedCardId/)
  assert.match(cardsClient, /initialAction === 'edit'/)
  assert.match(cardsClient, /mode: 'edit'/)
  assert.match(cardsClient, /scrollIntoView/)
  assert.match(cardsClient, /data-contextual-target/)
})

test('portfolio deep links resolve exact manual or Plaid accounts and focus the existing editor', () => {
  assert.match(portfolioPage, /account\.id === requestedAccountId/)
  assert.match(portfolioPage, /params\.accountSource !== 'plaid'/)
  assert.match(portfolioPage, /params\.accountSource !== 'manual'/)
  assert.doesNotMatch(portfolioPage, /account\.(?:name|official_name|mask) === requestedAccountId/)
  assert.match(portfolioPage, /focusEditor=\{editRequested\}/)
  assert.match(contextualTarget, /querySelector<HTMLElement>/)
})

test('connection deep links are household-scoped and never resolve by institution name', () => {
  assert.match(plaidPage, /\.eq\('user_id', user\.id\)/)
  assert.match(plaidPage, /connection\.id === requestedConnectionId/)
  assert.doesNotMatch(plaidPage, /institution_name === requestedConnectionId/)
  assert.match(plaidPage, /Conexión seleccionada desde Pagos/)
})

test('invalid or foreign IDs preserve the normal destination page safely', () => {
  assert.match(cardsPage, /invalidTarget = Boolean\(requestedCardId && !targetedCard\)/)
  assert.match(cardsClient, /La tarjeta solicitada no está disponible en este hogar/)
  assert.match(portfolioPage, /La cuenta solicitada no está disponible en este hogar/)
  assert.match(plaidPage, /La conexión solicitada no está disponible en este hogar/)
})

test('all contextual destinations provide a back link to Timeline', () => {
  assert.match(cardsClient, /href="\/timeline"[\s\S]*Volver a Pagos/)
  assert.match(portfolioPage, /href="\/timeline"[\s\S]*Volver a Pagos/)
  assert.match(plaidPage, /href="\/timeline"[\s\S]*Volver a Pagos/)
})

test('canonical destination routes remain present', () => {
  for (const path of ['app/cards/page.tsx', 'app/portfolio/page.tsx', 'app/plaid/page.tsx']) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true)
  }
})
