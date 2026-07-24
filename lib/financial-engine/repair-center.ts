import type {
  HealthCenterActionType,
  HealthCenterFinding,
  HealthCenterReport,
  HealthCenterSection,
} from './health-center'

export type RepairCenterArea =
  | 'Cards'
  | 'Transfers'
  | 'Income'
  | 'Plaid'
  | 'Accounts'
  | 'Planning'
  | 'Portfolio'
  | 'Snapshot'

export type RepairCenterStatus =
  | 'pending_review'
  | 'ready_to_repair'
  | 'user_confirmation_required'
  | 'waiting_for_external_sync'
  | 'completed'
  | 'ignored'

export type RepairCenterItem = {
  id: string
  area: RepairCenterArea
  title: string
  description: string
  severity: HealthCenterFinding['severity']
  confidence: HealthCenterFinding['confidence']
  affectedObjects: string[]
  whyThisMatters: string
  suggestedAction: string
  repairType: HealthCenterActionType
  status: RepairCenterStatus
  actionHref?: string
}

export type RepairCenterSection = {
  id: RepairCenterArea
  title: string
  healthScore: number
  findingCount: number
  criticalCount: number
  warningCount: number
  infoCount: number
  progress: number
  items: RepairCenterItem[]
}

export type RepairQueueSummary = {
  critical: number
  warnings: number
  information: number
  completedToday: number
}

export type RepairHistoryBucket = {
  label: 'Today' | 'Yesterday' | 'Last 7 Days'
  items: RepairCenterItem[]
}

export type RepairCenterReport = {
  generatedAt: string
  overallScore: number
  queue: RepairQueueSummary
  sections: RepairCenterSection[]
  items: RepairCenterItem[]
  history: RepairHistoryBucket[]
  source: HealthCenterReport
}

const AREA_ORDER: RepairCenterArea[] = [
  'Cards',
  'Transfers',
  'Income',
  'Plaid',
  'Accounts',
  'Planning',
  'Portfolio',
  'Snapshot',
]

function areaFor(finding: HealthCenterFinding): RepairCenterArea {
  if (finding.actionType === 'requires_external_sync') return 'Plaid'
  if (finding.domain === 'cards' || finding.domain === 'loans') return 'Cards'
  if (finding.domain === 'transfers' || finding.domain === 'ledger') return 'Transfers'
  if (finding.domain === 'income') return 'Income'
  if (finding.domain === 'accounts') return 'Accounts'
  if (finding.domain === 'planning' || finding.domain === 'obligations') return 'Planning'
  if (finding.domain === 'portfolio') return 'Portfolio'
  return 'Snapshot'
}

function areaForSection(section: HealthCenterSection): RepairCenterArea {
  if (section.id === 'cards' || section.id === 'loans') return 'Cards'
  if (section.id === 'transfers' || section.id === 'ledger') return 'Transfers'
  if (section.id === 'income') return 'Income'
  if (section.id === 'accounts') return 'Accounts'
  if (section.id === 'planning' || section.id === 'obligations') return 'Planning'
  if (section.id === 'portfolio') return 'Portfolio'
  return 'Snapshot'
}

function statusFor(finding: HealthCenterFinding): RepairCenterStatus {
  if (finding.severity === 'healthy') return 'completed'
  if (finding.actionType === 'requires_external_sync') return 'waiting_for_external_sync'
  if (finding.actionType === 'requires_user_input') {
    return 'user_confirmation_required'
  }
  if (finding.actionType === 'automatic_repairable') return 'ready_to_repair'
  return 'pending_review'
}

function actionHrefFor(finding: HealthCenterFinding, area: RepairCenterArea) {
  if (finding.actionHref) return finding.actionHref
  if (area === 'Cards') return '/cards'
  if (area === 'Transfers') return '/history'
  if (area === 'Income') return '/income'
  if (area === 'Plaid') return '/plaid'
  if (area === 'Accounts' || area === 'Portfolio') return '/portfolio'
  if (area === 'Planning') return '/planning'
  return '/health-center'
}

function whyThisMattersFor(finding: HealthCenterFinding) {
  if (finding.domain === 'cards' || finding.domain === 'loans') {
    return 'Debt and card metadata affects payoff priority, payment timing, and cash-risk explanations.'
  }
  if (finding.domain === 'income') {
    return 'Income metadata affects whether Mansor One can safely recommend waiting, paying now, or protecting cash.'
  }
  if (finding.domain === 'transfers' || finding.domain === 'ledger') {
    return 'Transfer and ledger integrity affects spending totals, income recognition, and duplicate-risk decisions.'
  }
  if (finding.domain === 'accounts' || finding.actionType === 'requires_external_sync') {
    return 'Account connection health affects balances, stale-data warnings, and confidence in current cash.'
  }
  if (finding.domain === 'planning' || finding.domain === 'obligations') {
    return 'Planning and obligation metadata affects household priorities and upcoming cash commitments.'
  }
  return 'This affects the confidence score used by Mansor One before presenting financial recommendations.'
}

function itemFor(finding: HealthCenterFinding): RepairCenterItem {
  const area = areaFor(finding)

  return {
    id: finding.id,
    area,
    title: finding.title,
    description: finding.explanation,
    severity: finding.severity,
    confidence: finding.confidence,
    affectedObjects: finding.affectedObjects,
    whyThisMatters: whyThisMattersFor(finding),
    suggestedAction: finding.recommendedAction,
    repairType: finding.actionType,
    status: statusFor(finding),
    actionHref: actionHrefFor(finding, area),
  }
}

function progressFor(items: RepairCenterItem[]) {
  if (items.length === 0) return 100
  const complete = items.filter((item) => item.status === 'completed').length
  return Math.round((complete / items.length) * 100)
}

function sectionScore(section: HealthCenterSection | undefined, items: RepairCenterItem[]) {
  if (section) return section.score
  return items.some((item) => item.severity === 'critical')
    ? 55
    : items.some((item) => item.severity === 'warning')
      ? 72
      : 90
}

function buildSections(
  report: HealthCenterReport,
  items: RepairCenterItem[]
): RepairCenterSection[] {
  return AREA_ORDER.map((area) => {
    const areaItems = items.filter((item) => item.area === area)
    const matchingSection = report.sections.find(
      (section) => areaForSection(section) === area
    )

    return {
      id: area,
      title: area,
      healthScore: sectionScore(matchingSection, areaItems),
      findingCount: areaItems.filter((item) => item.status !== 'completed').length,
      criticalCount: areaItems.filter((item) => item.severity === 'critical').length,
      warningCount: areaItems.filter((item) => item.severity === 'warning').length,
      infoCount: areaItems.filter(
        (item) => item.severity === 'healthy' || item.severity === 'unknown'
      ).length,
      progress: progressFor(areaItems),
      items: areaItems,
    }
  })
}

function queueFor(items: RepairCenterItem[]): RepairQueueSummary {
  return {
    critical: items.filter(
      (item) => item.severity === 'critical' && item.status !== 'completed'
    ).length,
    warnings: items.filter(
      (item) => item.severity === 'warning' && item.status !== 'completed'
    ).length,
    information: items.filter(
      (item) =>
        (item.severity === 'unknown' || item.severity === 'healthy') &&
        item.status !== 'completed'
    ).length,
    completedToday: items.filter((item) => item.status === 'completed').length,
  }
}

function historyFor(items: RepairCenterItem[]): RepairHistoryBucket[] {
  const completed = items.filter((item) => item.status === 'completed')

  return [
    { label: 'Today', items: completed },
    { label: 'Yesterday', items: [] },
    { label: 'Last 7 Days', items: completed },
  ]
}

export function buildRepairCenterReport(
  report: HealthCenterReport
): RepairCenterReport {
  const findings = report.sections.flatMap((section) => section.findings)
  const items = findings.map(itemFor)

  return {
    generatedAt: report.generatedAt,
    overallScore: report.overallScore,
    queue: queueFor(items),
    sections: buildSections(report, items),
    items,
    history: historyFor(items),
    source: report,
  }
}
