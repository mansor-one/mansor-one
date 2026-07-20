import type {
  DataHealthCheck,
  DataHealthDomain,
  DataHealthReport,
  DataHealthStatus,
} from './data-health'

export type HealthCenterActionType =
  | 'automatic_repairable'
  | 'requires_user_input'
  | 'requires_external_sync'
  | 'informational_only'

export type HealthCenterConfidence = 'low' | 'medium' | 'high'

export type HealthCenterFinding = {
  id: string
  domain: DataHealthDomain
  title: string
  explanation: string
  severity: DataHealthStatus
  confidence: HealthCenterConfidence
  affectedObjects: string[]
  recommendedAction: string
  actionType: HealthCenterActionType
  actionHref?: string
  canFixNow: boolean
}

export type HealthCenterSection = {
  id: DataHealthDomain | 'robototina'
  title: string
  score: number
  issueCount: number
  criticalCount: number
  warningCount: number
  infoCount: number
  findings: HealthCenterFinding[]
}

export type HealthCenterReadinessGate = {
  id: 'robototina' | 'atlas' | 'production'
  title: string
  score: number
  blockers: string[]
  nextSteps: string[]
}

export type HealthCenterBacklogItem = {
  id: string
  group:
    | 'Cards'
    | 'Income'
    | 'Accounts'
    | 'Transfers'
    | 'Plaid'
    | 'Planning'
    | 'Snapshot'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  estimatedImpact: string
  autoFixPotential: HealthCenterActionType
  actionHref?: string
}

export type HealthCenterReport = {
  generatedAt: string
  overallScore: number
  summary: string
  sections: HealthCenterSection[]
  readinessGates: HealthCenterReadinessGate[]
  repairBacklog: HealthCenterBacklogItem[]
  criticalFindings: HealthCenterFinding[]
  autoRepairableItems: HealthCenterFinding[]
  userActionRequired: HealthCenterFinding[]
  source: DataHealthReport
}

const SECTION_LABELS: Record<DataHealthDomain, string> = {
  accounts: 'Accounts and Plaid',
  cards: 'Cards',
  loans: 'Loans',
  income: 'Income',
  transfers: 'Transfers',
  obligations: 'Payments',
  ledger: 'Ledger',
  planning: 'Planning',
  portfolio: 'Portfolio',
  snapshot: 'Snapshot',
  security: 'Access and Security',
}

function scoreFor(checks: DataHealthCheck[]) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          checks.filter((item) => item.status === 'critical').length * 18 -
          checks.filter((item) => item.status === 'warning').length * 8 -
          checks.filter((item) => item.status === 'unknown').length * 12
      )
    )
  )
}

function confidenceFor(check: DataHealthCheck): HealthCenterConfidence {
  if (check.status === 'unknown') return 'low'
  if (check.requiresUserConfirmation) return 'medium'
  return 'high'
}

function actionTypeFor(check: DataHealthCheck): HealthCenterActionType {
  const signal = `${check.id} ${check.title} ${check.finding}`.toLowerCase()

  if (check.status === 'healthy') return 'informational_only'

  if (
    signal.includes('plaid') ||
    signal.includes('sync') ||
    signal.includes('expired') ||
    signal.includes('reconnect')
  ) {
    return 'requires_external_sync'
  }

  if (
    signal.includes('duplicate') ||
    signal.includes('category conflict') ||
    signal.includes('ledger') ||
    signal.includes('transfer-like')
  ) {
    return 'automatic_repairable'
  }

  if (
    check.requiresUserConfirmation ||
    signal.includes('owner') ||
    signal.includes('apr') ||
    signal.includes('due') ||
    signal.includes('frequency') ||
    signal.includes('metadata') ||
    signal.includes('missing')
  ) {
    return 'requires_user_input'
  }

  return 'informational_only'
}

function recommendedActionFor(
  check: DataHealthCheck,
  actionType: HealthCenterActionType
) {
  if (actionType === 'requires_external_sync') {
    return 'Reconnect or sync the institution, then run Health Center again.'
  }

  if (actionType === 'automatic_repairable') {
    return 'Review the candidate repair in the appropriate workflow before applying changes.'
  }

  if (actionType === 'requires_user_input') {
    return 'Confirm or complete the missing financial metadata.'
  }

  if (check.status === 'healthy') {
    return 'No action needed.'
  }

  return 'Review this finding before using it for recommendations.'
}

function affectedObjectsFor(check: DataHealthCheck) {
  return check.evidence.slice(0, 6)
}

function toFinding(check: DataHealthCheck): HealthCenterFinding {
  const actionType = actionTypeFor(check)

  return {
    id: check.id,
    domain: check.domain,
    title: check.title,
    explanation: check.finding,
    severity: check.status,
    confidence: confidenceFor(check),
    affectedObjects: affectedObjectsFor(check),
    recommendedAction: recommendedActionFor(check, actionType),
    actionType,
    actionHref: check.actionHref,
    canFixNow: actionType === 'automatic_repairable',
  }
}

function sectionFor(domain: DataHealthDomain, checks: DataHealthCheck[]) {
  const findings = checks.map(toFinding)

  return {
    id: domain,
    title: SECTION_LABELS[domain],
    score: scoreFor(checks),
    issueCount: checks.filter((item) => item.status !== 'healthy').length,
    criticalCount: checks.filter((item) => item.status === 'critical').length,
    warningCount: checks.filter((item) => item.status === 'warning').length,
    infoCount: checks.filter((item) => item.status === 'healthy').length,
    findings,
  } satisfies HealthCenterSection
}

function priorityFor(finding: HealthCenterFinding): HealthCenterBacklogItem['priority'] {
  if (finding.severity === 'critical') return 'critical'
  if (finding.severity === 'warning') return 'high'
  if (finding.severity === 'unknown') return 'medium'
  return 'low'
}

function groupFor(domain: DataHealthDomain): HealthCenterBacklogItem['group'] {
  if (domain === 'cards' || domain === 'loans') return 'Cards'
  if (domain === 'income') return 'Income'
  if (domain === 'accounts' || domain === 'portfolio') return 'Accounts'
  if (domain === 'transfers' || domain === 'ledger') return 'Transfers'
  if (domain === 'planning' || domain === 'obligations') return 'Planning'
  if (domain === 'snapshot' || domain === 'security') return 'Snapshot'
  return 'Snapshot'
}

function impactFor(finding: HealthCenterFinding) {
  if (finding.severity === 'critical') return 'High impact on recommendations'
  if (finding.severity === 'warning') return 'Medium impact on confidence'
  if (finding.severity === 'unknown') return 'Unknown until verified'
  return 'Informational'
}

function buildBacklog(findings: HealthCenterFinding[]) {
  return findings
    .filter((finding) => finding.severity !== 'healthy')
    .map((finding) => ({
      id: finding.id,
      group: groupFor(finding.domain),
      priority: priorityFor(finding),
      title: finding.title,
      estimatedImpact: impactFor(finding),
      autoFixPotential: finding.actionType,
      actionHref: finding.actionHref,
    }))
}

function gateScore(base: number, blockers: string[]) {
  return Math.max(0, Math.min(100, base - blockers.length * 8))
}

function buildReadinessGates(report: DataHealthReport, findings: HealthCenterFinding[]) {
  const critical = findings.filter((finding) => finding.severity === 'critical')
  const userInput = findings.filter(
    (finding) => finding.actionType === 'requires_user_input'
  )
  const externalSync = findings.filter(
    (finding) => finding.actionType === 'requires_external_sync'
  )
  const snapshotIssues = findings.filter((finding) => finding.domain === 'snapshot')
  const transferIssues = findings.filter((finding) => finding.domain === 'transfers')

  const robototinaBlockers = [
    critical.length > 0 ? `${critical.length} critical data findings` : null,
    userInput.length > 0 ? `${userInput.length} findings need user input` : null,
    snapshotIssues.some((finding) => finding.severity !== 'healthy')
      ? 'Snapshot readiness is not fully healthy'
      : null,
  ].filter(Boolean) as string[]

  const atlasBlockers = [
    ...robototinaBlockers,
    transferIssues.some((finding) => finding.severity !== 'healthy')
      ? 'Transfer integrity is not fully normalized'
      : null,
    'Atlas scenario contract is not implemented',
  ].filter(Boolean) as string[]

  const productionBlockers = [
    critical.length > 0 ? `${critical.length} critical findings` : null,
    externalSync.length > 0 ? `${externalSync.length} findings need external sync` : null,
    report.unknownChecks.length > 0
      ? `${report.unknownChecks.length} unknown data checks`
      : null,
  ].filter(Boolean) as string[]

  return [
    {
      id: 'robototina',
      title: 'Robototina Readiness',
      score: gateScore(report.score, robototinaBlockers),
      blockers: robototinaBlockers,
      nextSteps: [
        'Resolve critical Data Health findings.',
        'Complete user-input metadata for cards, income, and transfers.',
        'Run Health Center again after repairs.',
      ],
    },
    {
      id: 'atlas',
      title: 'Atlas Readiness',
      score: gateScore(Math.min(report.score, 72), atlasBlockers),
      blockers: atlasBlockers,
      nextSteps: [
        'Define TransferSummary before simulations.',
        'Add deterministic scenario fixtures.',
        'Use only complete Snapshot contracts.',
      ],
    },
    {
      id: 'production',
      title: 'Production Readiness',
      score: gateScore(Math.min(report.score, 78), productionBlockers),
      blockers: productionBlockers,
      nextSteps: [
        'Clear critical and unknown health findings.',
        'Confirm provider sync health.',
        'Complete production smoke test checklist.',
      ],
    },
  ] satisfies HealthCenterReadinessGate[]
}

export function buildHealthCenterReport(
  report: DataHealthReport
): HealthCenterReport {
  const domains = [...new Set(report.checks.map((check) => check.domain))]
  const sections = domains.map((domain) =>
    sectionFor(
      domain,
      report.checks.filter((check) => check.domain === domain)
    )
  )
  const findings = sections.flatMap((section) => section.findings)
  const criticalFindings = findings.filter((finding) => finding.severity === 'critical')
  const autoRepairableItems = findings.filter(
    (finding) => finding.actionType === 'automatic_repairable'
  )
  const userActionRequired = findings.filter(
    (finding) => finding.actionType === 'requires_user_input'
  )
  const readinessGates = buildReadinessGates(report, findings)

  return {
    generatedAt: report.generatedAt,
    overallScore: report.score,
    summary:
      criticalFindings.length > 0
        ? 'Financial data has critical issues that should be reviewed before high-confidence recommendations.'
        : userActionRequired.length > 0
          ? 'Financial data is usable, but some metadata still needs household confirmation.'
          : 'Financial data is in good operational shape based on current checks.',
    sections,
    readinessGates,
    repairBacklog: buildBacklog(findings),
    criticalFindings,
    autoRepairableItems,
    userActionRequired,
    source: report,
  }
}
