import Link from 'next/link'

type LabLink = {
  href: string
  label: string
  description: string
}

const importReviewLinks: LabLink[] = [
  {
    href: '/lab/ledger-summary',
    label: 'Ledger Summary',
    description: 'Validate confirmed ledger, import buckets, and duplicates.',
  },
  {
    href: '/plaid-import',
    label: 'Import / Review Queue',
    description: 'Review Plaid import candidates before they become ledger rows.',
  },
  {
    href: '/merchant-rules',
    label: 'Merchant Rules',
    description: 'Legacy merchant rule editor.',
  },
  {
    href: '/ath-movil',
    label: 'ATH Movil',
    description: 'ATH email enrichment and review surface.',
  },
  {
    href: '/imports',
    label: 'Email Import Preview',
    description: 'Manual email parsing preview tool.',
  },
]

const engineLinks: LabLink[] = [
  {
    href: '/dev/decision-engine',
    label: 'Decision Engine',
    description: 'Rule-based prioritized decision queue.',
  },
  {
    href: '/dev/financial-summary',
    label: 'Financial Summary',
    description: 'Interpretation layer over Portfolio, Liquidity, and Planning.',
  },
  {
    href: '/dev/goals',
    label: 'Goal Engine',
    description: 'Read-only goal health and funding ledger foundation.',
  },
  {
    href: '/dev/reconciliation',
    label: 'Reconciliation',
    description: 'Read-only payment and transaction match proposals.',
  },
  {
    href: '/dev/categories',
    label: 'Categories',
    description: 'Canonical category registry.',
  },
  {
    href: '/dev/merchant-knowledge',
    label: 'Merchant Knowledge',
    description: 'Merchant normalization, confidence, and observations.',
  },
  {
    href: '/dev/financial-identity',
    label: 'Financial Identity',
    description: 'Classify transaction names into entity/event types.',
  },
]

function LinkGrid({ title, links }: { title: string; links: LabLink[] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">{title}</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {links.map((link) => (
          <Link
            className="border rounded p-4 block space-y-2"
            href={link.href}
            key={link.href}
          >
            <h3 className="text-xl font-semibold">{link.label}</h3>
            <p className="text-sm opacity-70">{link.description}</p>
            <p className="text-sm">{link.href}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function LabPage() {
  return (
    <main className="p-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold">Engineering Lab</h1>
        <p className="text-sm opacity-70">
          Lab = engineering, admin, import review, and validation tools.
          Production navigation stays focused on daily-use pages.
        </p>
        <Link className="inline-block border rounded p-2" href="/">
          Back to Dashboard
        </Link>
      </div>

      <LinkGrid title="Import And Review" links={importReviewLinks} />
      <LinkGrid title="Financial Engine Tools" links={engineLinks} />
    </main>
  )
}
