import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import manifest from '../app/manifest.ts'
import { paginateReviewQueue } from '../lib/financial-engine/review-queue-pagination.ts'
import type { ReviewQueueCandidate } from '../lib/financial-engine/review-queue.ts'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function candidate(index: number, classification: ReviewQueueCandidate['classification'] = 'needsCategory') {
  return {
    classification,
    transaction: {
      id: `transaction-${index}`,
      sourceTable: 'plaid_imports',
      plaidTransactionId: `plaid-${index}`,
      metadata: {},
    },
    duplicateContext: null,
  } as ReviewQueueCandidate
}

test('PWA manifest is standalone, scoped and uses only local Mansor One icons', () => {
  const value = manifest()
  assert.equal(value.id, '/')
  assert.equal(value.start_url, '/')
  assert.equal(value.scope, '/')
  assert.equal(value.display, 'standalone')
  assert.equal(value.theme_color, '#0b1220')
  assert.equal(value.background_color, '#050814')
  assert.ok(value.icons?.some((icon) => icon.purpose === 'maskable'))
  for (const icon of value.icons || []) assert.match(icon.src, /^\/icons\/mansor-/)
})

test('PWA metadata and install assets are public and complete', () => {
  const layout = source('app/layout.tsx')
  const proxy = source('lib/supabase/proxy.ts')
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/)
  assert.match(layout, /appleWebApp/)
  assert.match(layout, /viewportFit: "cover"/)
  assert.match(proxy, /'\/manifest\.webmanifest'/)
  for (const asset of [
    'public/icons/mansor-192.png',
    'public/icons/mansor-512.png',
    'public/icons/mansor-maskable-512.png',
    'public/icons/apple-touch-icon.png',
    'public/icons/mansor-1024.png',
  ]) assert.equal(existsSync(new URL(`../${asset}`, import.meta.url)), true, asset)
  assert.equal(existsSync(new URL('../public/service-worker.js', import.meta.url)), false)
})

test('mobile navigation exposes approved destinations, touch targets and accessible sheet behavior', () => {
  const nav = source('app/components/MobileNavigation.tsx')
  for (const label of ['Inicio', 'Pagos', 'Robototina', 'Movimientos', 'Más', 'Tarjetas', 'Bancos', 'Patrimonio', 'Reportes', 'Metas', 'Reparaciones', 'Mi cuenta', 'Cerrar sesión']) {
    assert.match(nav, new RegExp(label))
  }
  assert.match(nav, /min-h-11/)
  assert.match(nav, /event\.key === 'Escape'/)
  assert.match(nav, /firstLinkRef\.current\?\.focus/)
  assert.match(nav, /trigger\?\.focus/)
  assert.match(nav, /event\.key === 'Tab'/)
  assert.match(nav, /document\.body\.style\.overflow = 'hidden'/)
})

test('safe areas protect mobile navigation, sheets, drawers and page content', () => {
  const css = source('app/globals.css')
  assert.match(css, /env\(safe-area-inset-top\)/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(css, /mobile-bottom-nav/)
  assert.match(css, /mobile-content-safe/)
  assert.match(css, /mobile-safe-drawer/)
})

test('Review Queue server pagination renders at most 25 groups and keeps global counts', () => {
  const rows = Array.from({ length: 61 }, (_, index) => candidate(index))
  const page = paginateReviewQueue({
    candidates: rows,
    needsCategory: rows,
    readyToConfirm: [],
    possibleDuplicate: [],
    athReview: [],
    paymentConfirmation: [],
    needsManualReview: [],
    tab: 'toReview',
    page: 2,
    pageSize: 25,
  })
  assert.equal(page.page, 2)
  assert.equal(page.pageCount, 3)
  assert.equal(page.candidates.length, 25)
  assert.equal(page.counts.toReview, 61)
  assert.equal(page.totalGroups, 61)
  assert.ok(page.candidates.every((row) => Number(row.transaction.id.split('-')[1]) >= 25))
})

test('History limits rendered movements while preserving full filtered totals', () => {
  const history = source('app/history/HistoryClient.tsx')
  assert.match(history, /HISTORY_PAGE_SIZE = 50/)
  assert.match(history, /pagedMovements = filteredMovements\.slice/)
  assert.match(history, /pagedMovements\.map/)
  assert.doesNotMatch(history, /filteredMovements\.map\(\(movement\)/)
})

test('Timeline uses the existing mobile agenda and its drawer is mobile-safe', () => {
  const schedule = source('app/components/PaymentScheduleView.tsx')
  const drawer = source('app/components/FinancialObligationDrawer.tsx')
  assert.match(schedule, /md:hidden">Agenda/)
  assert.match(schedule, /mobileCalendarDates/)
  assert.match(drawer, /mobile-safe-drawer/)
  assert.match(drawer, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(drawer, /min-h-11 min-w-11/)
  assert.match(drawer, /opener\?\.focus/)
})

test('Reports use mobile debt cards and retain the desktop print table', () => {
  const page = source('app/reports/page.tsx')
  const actions = source('app/reports/ReportActions.tsx')
  assert.match(page, /grid gap-3 md:hidden/)
  assert.match(page, /hidden md:block"><table/)
  assert.match(actions, /Imprimir \/ Guardar como PDF/)
})

test('authenticated routing and Supabase cookie architecture remain unchanged', () => {
  const proxy = source('lib/supabase/proxy.ts')
  const server = source('lib/supabase/server.ts')
  const client = source('lib/supabase/client.ts')
  assert.match(proxy, /supabase\.auth\.getClaims\(\)/)
  assert.match(proxy, /private, no-store/)
  assert.match(proxy, /searchParams\.set/)
  assert.match(server, /createServerClient/)
  assert.match(client, /createBrowserClient/)
  assert.doesNotMatch(client, /localStorage/)
})
