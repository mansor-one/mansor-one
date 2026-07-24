'use client'

import { useMemo, useState } from 'react'
import type {
  MerchantCategoryCount,
  MerchantConfidenceReason,
  MerchantLearningBadge,
  MerchantLearningStateName,
} from '@/lib/financial-engine'

type SourceName = 'plaid_imports' | 'quick_entries'

export type MerchantKnowledgeExplorerObservation = {
  id: string
  source: SourceName
  rawMerchantName: string | null
  merchantName: string | null
  plaidTransactionId: string | null
  institutionName: string | null
  accountName: string | null
  accountMask: string | null
  amount: number
  date: string
  legacyCategoryText: string | null
  canonicalCategoryCode: string | null
  isConfirmed: boolean
}

type LogicalObservationGroup = {
  key: string
  observations: MerchantKnowledgeExplorerObservation[]
  date: string
  amount: number
  confirmedCount: number
  importCount: number
  categories: string[]
  plaidTransactionId: string | null
  accountLabel: string
}

type MonthlyHistoryRow = {
  month: string
  logicalTransactions: number
  confirmedCount: number
  importCount: number
  totalAmount: number
  categories: string[]
}

export type MerchantKnowledgeExplorerRow = {
  normalizedMerchantName: string
  canonicalCategoryCode: string | null
  canonicalCategoryLabel: string
  timesSeen: number
  timesConfirmed: number
  timesChanged: number
  firstSeen: string | null
  lastSeen: string | null
  confidence: number
  currentConfidence: number
  categoryConsensus: number
  driftDetected: boolean
  latestCategoryCode: string | null
  latestCategoryLabel: string
  learningStatus: MerchantLearningStateName
  learningBadge: MerchantLearningBadge
  isAutoConfirmable: boolean
  shouldAskAgain: boolean
  sourceCounts: Record<SourceName, number>
  sourceMerchants: string[]
  legacyCategories: { label: string; count: number }[]
  categoryCounts: MerchantCategoryCount[]
  confidenceReasons: MerchantConfidenceReason[]
  learningBlockers: string[]
  observations: MerchantKnowledgeExplorerObservation[]
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function badgeLabel(badge: MerchantLearningBadge) {
  if (badge === 'learned') return 'Learned'
  if (badge === 'learning') return 'Learning'
  return 'Unknown'
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportRows(merchants: MerchantKnowledgeExplorerRow[]) {
  return merchants.map((merchant) => ({
    merchant: merchant.normalizedMerchantName,
    aliases: merchant.sourceMerchants.join(' | '),
    category: merchant.canonicalCategoryLabel,
    status: merchant.learningStatus,
    badge: badgeLabel(merchant.learningBadge),
    confidence: percent(merchant.currentConfidence),
    times_seen: merchant.timesSeen,
    times_confirmed: merchant.timesConfirmed,
    first_seen: merchant.firstSeen || '',
    last_seen: merchant.lastSeen || '',
    auto_confirm: merchant.isAutoConfirmable ? 'yes' : 'no',
    needs_attention: merchant.shouldAskAgain ? 'yes' : 'no',
    blockers: merchant.learningBlockers.join(' | '),
  }))
}

function observationReason(observation: MerchantKnowledgeExplorerObservation) {
  if (observation.source === 'quick_entries') {
    return observation.canonicalCategoryCode
      ? 'Counted for confirmed merchant learning.'
      : 'Confirmed ledger row, but category did not map to a canonical category.'
  }

  return 'Import observation only; ignored for confirmed learning.'
}

function accountLabel(observation: MerchantKnowledgeExplorerObservation) {
  const account = observation.accountName || 'Unknown account'
  const mask = observation.accountMask ? `••••${observation.accountMask}` : null
  const accountText = [account, mask].filter(Boolean).join(' ')

  return [observation.institutionName, accountText].filter(Boolean).join(' · ')
}

function logicalObservationKey(
  observation: MerchantKnowledgeExplorerObservation
) {
  return [
    observation.plaidTransactionId || 'no-plaid-id',
    observation.date,
    Math.abs(Number(observation.amount || 0)).toFixed(2),
    accountLabel(observation),
  ].join(':')
}

function logicalObservationGroups(
  observations: MerchantKnowledgeExplorerObservation[]
): LogicalObservationGroup[] {
  const groups = new Map<string, MerchantKnowledgeExplorerObservation[]>()

  observations.forEach((observation) => {
    const key = logicalObservationKey(observation)
    const group = groups.get(key) || []
    group.push(observation)
    groups.set(key, group)
  })

  return [...groups.entries()]
    .map(([key, group]) => {
      const primary = group[0]
      const categories = [
        ...new Set(
          group
            .map(
              (observation) =>
                observation.canonicalCategoryCode ||
                observation.legacyCategoryText ||
                null
            )
            .filter((category): category is string => Boolean(category))
        ),
      ]

      return {
        key,
        observations: group,
        date: primary.date,
        amount: Math.abs(Number(primary.amount || 0)),
        confirmedCount: group.filter((observation) => observation.isConfirmed).length,
        importCount: group.filter((observation) => !observation.isConfirmed).length,
        categories,
        plaidTransactionId: primary.plaidTransactionId,
        accountLabel: accountLabel(primary) || 'Unknown account',
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

function monthlyHistory(
  observations: MerchantKnowledgeExplorerObservation[]
): MonthlyHistoryRow[] {
  const groups = logicalObservationGroups(observations)
  const months = new Map<string, LogicalObservationGroup[]>()

  groups.forEach((group) => {
    const month = group.date.slice(0, 7) || 'Unknown'
    const monthGroups = months.get(month) || []
    monthGroups.push(group)
    months.set(month, monthGroups)
  })

  return [...months.entries()]
    .map(([month, monthGroups]) => ({
      month,
      logicalTransactions: monthGroups.length,
      confirmedCount: monthGroups.reduce(
        (sum, group) => sum + group.confirmedCount,
        0
      ),
      importCount: monthGroups.reduce((sum, group) => sum + group.importCount, 0),
      totalAmount: monthGroups.reduce((sum, group) => sum + group.amount, 0),
      categories: [
        ...new Set(monthGroups.flatMap((group) => group.categories)),
      ],
    }))
    .sort((a, b) => b.month.localeCompare(a.month))
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded p-4">
      <h2 className="font-semibold">{label}</h2>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  )
}

function MerchantDetail({
  merchant,
  onClose,
}: {
  merchant: MerchantKnowledgeExplorerRow
  onClose: () => void
}) {
  const logicalGroups = logicalObservationGroups(merchant.observations)
  const monthlyRows = monthlyHistory(merchant.observations)
  const confirmedEntries = merchant.observations.filter(
    (observation) => observation.isConfirmed
  )
  const importRows = merchant.observations.filter(
    (observation) => !observation.isConfirmed
  )

  return (
    <section className="border rounded p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{merchant.normalizedMerchantName}</h2>
          <p className="text-sm opacity-70">
            {merchant.canonicalCategoryLabel} · {badgeLabel(merchant.learningBadge)}
          </p>
        </div>
        <button
          className="border rounded px-3 py-2 text-sm font-medium"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <p>Times seen: {merchant.timesSeen}</p>
        <p>Times confirmed: {merchant.timesConfirmed}</p>
        <p>Confidence: {percent(merchant.currentConfidence)}</p>
        <p>Auto-confirm: {merchant.isAutoConfirmable ? 'Yes' : 'No'}</p>
        <p>Logical transactions: {logicalGroups.length}</p>
        <p>Confirmed entries: {confirmedEntries.length}</p>
        <p>Import/source rows: {importRows.length}</p>
      </div>

      <div>
        <p className="font-semibold">Aliases</p>
        <p className="text-sm">{merchant.sourceMerchants.join(', ') || 'None'}</p>
      </div>

      <div>
        <p className="font-semibold">Investigate</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <p>Raw merchant: {merchant.sourceMerchants.join(', ') || 'Unknown'}</p>
          <p>Normalized merchant: {merchant.normalizedMerchantName}</p>
          <p>
            Accounts:{' '}
            {[
              ...new Set(
                merchant.observations
                  .map(accountLabel)
                  .filter(Boolean)
              ),
            ].join(', ') || 'Unknown'}
          </p>
          <p>
            Amounts:{' '}
            {[
              ...new Set(
                merchant.observations.map((observation) =>
                  `$${money(observation.amount)}`
                )
              ),
            ].join(', ')}
          </p>
          <p>
            Dates:{' '}
            {[
              ...new Set(merchant.observations.map((observation) => observation.date)),
            ].join(', ')}
          </p>
          <p>
            Categories:{' '}
            {merchant.legacyCategories
              .map((category) => `${category.label} (${category.count})`)
              .join(', ') || 'None'}
          </p>
        </div>
      </div>

      <div>
        <p className="font-semibold">Monthly history</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3">Month</th>
                <th className="py-2 pr-3">Logical transactions</th>
                <th className="py-2 pr-3">Confirmed count</th>
                <th className="py-2 pr-3">Import/source rows</th>
                <th className="py-2 pr-3">Total amount</th>
                <th className="py-2 pr-3">Categories used</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((row) => (
                <tr className="border-b" key={row.month}>
                  <td className="py-2 pr-3">{row.month}</td>
                  <td className="py-2 pr-3">{row.logicalTransactions}</td>
                  <td className="py-2 pr-3">{row.confirmedCount}</td>
                  <td className="py-2 pr-3">{row.importCount}</td>
                  <td className="py-2 pr-3">${money(row.totalAmount)}</td>
                  <td className="py-2 pr-3">
                    {row.categories.join(', ') || 'None'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="font-semibold">Logical transactions</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Confirmed entries</th>
                <th className="py-2 pr-3">Import/source rows</th>
                <th className="py-2 pr-3">Categories</th>
              </tr>
            </thead>
            <tbody>
              {logicalGroups.map((group) => (
                <tr className="border-b" key={group.key}>
                  <td className="py-2 pr-3">{group.date}</td>
                  <td className="py-2 pr-3">${money(group.amount)}</td>
                  <td className="py-2 pr-3">{group.accountLabel}</td>
                  <td className="py-2 pr-3">{group.confirmedCount}</td>
                  <td className="py-2 pr-3">{group.importCount}</td>
                  <td className="py-2 pr-3">
                    {group.categories.join(', ') || 'None'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="font-semibold">Why not auto-confirming</p>
        <ul className="list-disc pl-5 text-sm">
          {merchant.learningBlockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      </div>

      <div>
        <p className="font-semibold">Confidence reasons</p>
        <ul className="list-disc pl-5 text-sm">
          {merchant.confidenceReasons.map((reason) => (
            <li key={reason.code}>
              {reason.description} ({reason.impact > 0 ? '+' : ''}
              {percent(reason.impact)})
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto">
        <p className="font-semibold mb-2">All appearances</p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Source</th>
              <th className="py-2 pr-3">Merchant</th>
              <th className="py-2 pr-3">Amount</th>
              <th className="py-2 pr-3">Account</th>
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3">Learning</th>
            </tr>
          </thead>
          <tbody>
            {merchant.observations.map((observation) => (
              <tr className="border-b" key={observation.id}>
                <td className="py-2 pr-3">{observation.date}</td>
                <td className="py-2 pr-3">{observation.source}</td>
                <td className="py-2 pr-3">
                  {observation.rawMerchantName || 'Unknown'}
                </td>
                <td className="py-2 pr-3">${money(observation.amount)}</td>
                <td className="py-2 pr-3">
                  {accountLabel(observation) || 'Unknown'}
                </td>
                <td className="py-2 pr-3">
                  {observation.canonicalCategoryCode ||
                    observation.legacyCategoryText ||
                    'None'}
                </td>
                <td className="py-2 pr-3">{observationReason(observation)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function MerchantKnowledgeExplorer({
  merchants,
}: {
  merchants: MerchantKnowledgeExplorerRow[]
}) {
  const [merchantQuery, setMerchantQuery] = useState('')
  const [categoryQuery, setCategoryQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [badge, setBadge] = useState('all')
  const [autoConfirm, setAutoConfirm] = useState('all')
  const [needsAttention, setNeedsAttention] = useState('all')
  const [source, setSource] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedMerchantName, setSelectedMerchantName] = useState<string | null>(
    null
  )
  const clearFilters = () => {
    setMerchantQuery('')
    setCategoryQuery('')
    setStatus('all')
    setBadge('all')
    setAutoConfirm('all')
    setNeedsAttention('all')
    setSource('all')
    setStartDate('')
    setEndDate('')
  }

  const filteredMerchants = useMemo(
    () =>
      merchants.filter((merchant) => {
        const merchantText = [
          merchant.normalizedMerchantName,
          ...merchant.sourceMerchants,
        ]
          .join(' ')
          .toLowerCase()
        const categoryText = [
          merchant.canonicalCategoryLabel,
          merchant.canonicalCategoryCode || '',
          ...merchant.legacyCategories.map((category) => category.label),
        ]
          .join(' ')
          .toLowerCase()
        const inDateRange =
          (!startDate || (merchant.lastSeen || '') >= startDate) &&
          (!endDate || (merchant.firstSeen || '') <= endDate)

        return (
          (!merchantQuery ||
            merchantText.includes(merchantQuery.toLowerCase())) &&
          (!categoryQuery ||
            categoryText.includes(categoryQuery.toLowerCase())) &&
          (status === 'all' || merchant.learningStatus === status) &&
          (badge === 'all' || merchant.learningBadge === badge) &&
          (autoConfirm === 'all' ||
            merchant.isAutoConfirmable === (autoConfirm === 'yes')) &&
          (needsAttention === 'all' ||
            merchant.shouldAskAgain === (needsAttention === 'yes')) &&
          (source === 'all' || merchant.sourceCounts[source as SourceName] > 0) &&
          inDateRange
        )
      }),
    [
      autoConfirm,
      badge,
      categoryQuery,
      endDate,
      merchantQuery,
      merchants,
      needsAttention,
      source,
      startDate,
      status,
    ]
  )

  const selectedMerchant =
    filteredMerchants.find(
      (merchant) => merchant.normalizedMerchantName === selectedMerchantName
    ) || null
  const learnedCount = merchants.filter(
    (merchant) => merchant.learningBadge === 'learned'
  ).length
  const learningCount = merchants.filter(
    (merchant) => merchant.learningBadge === 'learning'
  ).length
  const unknownCount = merchants.filter(
    (merchant) => merchant.learningBadge === 'unknown'
  ).length
  const needsAttentionCount = merchants.filter(
    (merchant) => merchant.shouldAskAgain
  ).length
  const autoConfirmCount = merchants.filter(
    (merchant) => merchant.isAutoConfirmable
  ).length

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard label="Learned merchants" value={learnedCount} />
        <StatCard label="Learning merchants" value={learningCount} />
        <StatCard label="Unknown merchants" value={unknownCount} />
        <StatCard label="Needs attention" value={needsAttentionCount} />
        <StatCard label="Auto-confirm ready" value={autoConfirmCount} />
      </section>

      <section className="border rounded p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-sm">
            Merchant
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              onChange={(event) => setMerchantQuery(event.target.value)}
              value={merchantQuery}
            />
          </label>
          <label className="text-sm">
            Category
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              onChange={(event) => setCategoryQuery(event.target.value)}
              value={categoryQuery}
            />
          </label>
          <label className="text-sm">
            Status
            <select
              className="mt-1 w-full border rounded px-3 py-2"
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="learning">Learning</option>
              <option value="stable">Stable</option>
              <option value="trusted">Trusted</option>
              <option value="auto_confirm">Auto confirm</option>
              <option value="needs_review">Needs review</option>
            </select>
          </label>
          <label className="text-sm">
            Badge
            <select
              className="mt-1 w-full border rounded px-3 py-2"
              onChange={(event) => setBadge(event.target.value)}
              value={badge}
            >
              <option value="all">All</option>
              <option value="learned">Learned</option>
              <option value="learning">Learning</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label className="text-sm">
            Auto-confirm eligible
            <select
              className="mt-1 w-full border rounded px-3 py-2"
              onChange={(event) => setAutoConfirm(event.target.value)}
              value={autoConfirm}
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="text-sm">
            Needs attention
            <select
              className="mt-1 w-full border rounded px-3 py-2"
              onChange={(event) => setNeedsAttention(event.target.value)}
              value={needsAttention}
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="text-sm">
            Source
            <select
              className="mt-1 w-full border rounded px-3 py-2"
              onChange={(event) => setSource(event.target.value)}
              value={source}
            >
              <option value="all">All</option>
              <option value="quick_entries">Confirmed ledger</option>
              <option value="plaid_imports">Plaid imports</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              From
              <input
                className="mt-1 w-full border rounded px-3 py-2"
                onChange={(event) => setStartDate(event.target.value)}
                type="date"
                value={startDate}
              />
            </label>
            <label className="text-sm">
              To
              <input
                className="mt-1 w-full border rounded px-3 py-2"
                onChange={(event) => setEndDate(event.target.value)}
                type="date"
                value={endDate}
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="border rounded px-3 py-2 text-sm font-medium"
            onClick={clearFilters}
            type="button"
          >
            Clear Filters
          </button>
          <button
            className="border rounded px-3 py-2 text-sm font-medium"
            onClick={() => downloadCsv('merchant-knowledge.csv', exportRows(merchants))}
            type="button"
          >
            Export All Merchants CSV
          </button>
          <button
            className="border rounded px-3 py-2 text-sm font-medium"
            onClick={() =>
              downloadCsv(
                'merchant-knowledge-needs-attention.csv',
                exportRows(merchants.filter((merchant) => merchant.shouldAskAgain))
              )
            }
            type="button"
          >
            Export Needs Attention CSV
          </button>
        </div>
      </section>

      {selectedMerchant && (
        <MerchantDetail
          merchant={selectedMerchant}
          onClose={() => setSelectedMerchantName(null)}
        />
      )}

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-bold">
          Merchants ({filteredMerchants.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3">Merchant</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Badge</th>
                <th className="py-2 pr-3">Confidence</th>
                <th className="py-2 pr-3">Seen</th>
                <th className="py-2 pr-3">Confirmed</th>
                <th className="py-2 pr-3">Last seen</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredMerchants.map((merchant) => (
                <tr className="border-b" key={merchant.normalizedMerchantName}>
                  <td className="py-2 pr-3 font-medium">
                    {merchant.normalizedMerchantName}
                  </td>
                  <td className="py-2 pr-3">{merchant.canonicalCategoryLabel}</td>
                  <td className="py-2 pr-3">{merchant.learningStatus}</td>
                  <td className="py-2 pr-3">{badgeLabel(merchant.learningBadge)}</td>
                  <td className="py-2 pr-3">
                    {percent(merchant.currentConfidence)}
                  </td>
                  <td className="py-2 pr-3">{merchant.timesSeen}</td>
                  <td className="py-2 pr-3">{merchant.timesConfirmed}</td>
                  <td className="py-2 pr-3">{merchant.lastSeen || 'Unknown'}</td>
                  <td className="py-2 pr-3">
                    <button
                      className="border rounded px-3 py-1 text-sm"
                      onClick={() =>
                        setSelectedMerchantName(merchant.normalizedMerchantName)
                      }
                      type="button"
                    >
                      {merchant.learningBadge === 'unknown'
                        ? 'Investigate'
                        : 'Details'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
