import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMonthlyReport, parseReportMonth } from '../lib/financial-engine/monthly-report.ts'
import type { LedgerSummaryTransaction } from '../lib/financial-engine/ledger-summary.ts'
import type { PortfolioSummary } from '../lib/financial-engine/types.ts'

function transaction(id: string, date: string, amount: number, category: string): LedgerSummaryTransaction {
  return { id, sourceTable: 'quick_entries', date, description: id, amount, category, imported: true, source: 'manual', plaidTransactionId: null, metadata: {} }
}

const portfolio = {
  totalLiquidAvailable: 2400,
  totalLiabilities: 900,
  netWorth: 4100,
  liquidAssets: [{ id: 'cash', sourceId: 'plaid-cash', name: 'Cuenta', institution: 'Bank', balance: 2400, source: 'plaid', isManual: false, isConnected: true }],
  liabilities: [{ id: 'card', name: 'Visa', institution: 'Bank', balance: 900, source: 'plaid', isConnected: true }],
} as PortfolioSummary

test('monthly report is reusable and isolates the selected calendar month', () => {
  const report = buildMonthlyReport({
    month: '2026-08',
    now: new Date('2026-08-15T12:00:00-04:00'),
    transactions: [
      transaction('salary', '2026-08-01', 3000, 'income_salary'),
      transaction('food', '2026-08-02', 125, 'food'),
      transaction('transfer', '2026-08-03', 200, 'transfers_internal'),
      transaction('card-payment', '2026-08-04', 500, 'transfers_card_payment'),
      transaction('july', '2026-07-31', 999, 'food'),
    ],
    obligations: [
      { id: 'paid', name: 'Agua', amount: 29.88, dueDate: '2026-08-10', status: 'paid' },
      { id: 'future', name: 'Internet', amount: 70, dueDate: '2026-08-20', status: 'pending' },
    ],
    portfolio,
    pendingReviewCount: 4,
  })

  assert.equal(report.period.label, 'Agosto 2026')
  assert.equal(report.summary.income, 3000)
  assert.equal(report.summary.confirmedExpenses, 125)
  assert.equal(report.cashFlow.transfers, 200)
  assert.equal(report.cashFlow.debtPayments, 500)
  assert.equal(report.obligations.paid.length, 1)
  assert.equal(report.obligations.upcoming.length, 1)
  assert.equal(report.review.pending, 4)
  assert.match(report.dataQualityNotes[0], /Review Queue/)
  assert.equal(report.robototinaNotes.some((note) => note.includes('Review Queue')), false)
  assert.equal(report.debt[0].source, 'plaid')
  assert.equal(report.categories.some((row) => row.amount === 999), false)
})

test('account activity and possible legacy duplicates are presentation-only metadata', () => {
  const active = transaction('bank-activity', '2026-08-02', 20, 'food')
  active.metadata = { plaidAccountId: 'plaid-active', accountName: 'Active' }
  const report = buildMonthlyReport({
    month: '2026-08',
    now: new Date('2026-08-15T12:00:00-04:00'),
    transactions: [active],
    obligations: [
      { id: 'legacy-water', name: 'Agua', amount: 29.88, dueDate: '2026-08-22', status: 'pending' },
      { id: 'canonical-water', name: 'Agua', amount: 29.88, dueDate: '2026-08-22', status: 'pending' },
    ],
    portfolio: {
      ...portfolio,
      liquidAssets: [
        { ...portfolio.liquidAssets[0], id: 'active', sourceId: 'plaid-active', name: 'Active', balance: 0 },
        { ...portfolio.liquidAssets[0], id: 'inactive', sourceId: 'plaid-inactive', name: 'Inactive', balance: 0 },
      ],
    },
    pendingReviewCount: 0,
  })

  assert.equal(report.bankAccounts.find((account) => account.id === 'active')?.hasActivity, true)
  assert.equal(report.bankAccounts.find((account) => account.id === 'inactive')?.hasActivity, false)
  assert.ok(report.dataQualityNotes.some((note) => /Posible duplicidad legacy/.test(note)))
})

test('invalid report month falls back safely and valid months expose exact boundaries', () => {
  assert.deepEqual(parseReportMonth('2026-07', new Date('2026-08-15T12:00:00-04:00')), {
    month: '2026-07', startDate: '2026-07-01', endDate: '2026-07-31', label: 'Julio 2026', isOpen: false,
  })
  assert.equal(parseReportMonth('not-a-month', new Date('2026-08-15T12:00:00-04:00')).month, '2026-08')
})

test('report presentation includes month selection, print and PDF controls', async () => {
  const fs = await import('node:fs/promises')
  const [page, actions, nav] = await Promise.all([
    fs.readFile('app/reports/page.tsx', 'utf8'),
    fs.readFile('app/reports/ReportActions.tsx', 'utf8'),
    fs.readFile('app/components/PrimaryNav.tsx', 'utf8'),
  ])
  assert.match(page, /data-report-month/)
  assert.match(page, /getObligationLifecyclePaymentItems/)
  assert.match(page, /horizonEnd: period\.endDate/)
  assert.match(page, /row\.id\.startsWith\('projected:'\)/)
  assert.match(page, /Datos históricos del mes/)
  assert.match(page, /Snapshot financiero actual/)
  assert.match(page, /Estado operativo actual de Mansor One/)
  assert.match(page, /Valor actual — no histórico/)
  assert.match(page, /Manual \/ legacy/)
  assert.match(page, /balance \$0 y sin actividad del mes/)
  assert.match(actions, /type="month"/)
  assert.match(actions, /Imprimir/)
  assert.match(actions, /Imprimir \/ Guardar como PDF/)
  assert.match(nav, /href: '\/reports'/)
})
