type InstitutionBrand = {
  label: string
  initials: string
  badgeClassName: string
}

type InstitutionLogoProps = {
  institution?: string | null
  size?: 'sm' | 'md'
  showLabel?: boolean
}

const institutionBrands: Array<{
  aliases: string[]
  brand: InstitutionBrand
}> = [
  {
    aliases: ['BANCO POPULAR', 'POPULAR', 'PREMIA'],
    brand: {
      label: 'Banco Popular',
      initials: 'BP',
      badgeClassName: 'border-sky-700 bg-sky-950 text-sky-100',
    },
  },
  {
    aliases: ['CHASE'],
    brand: {
      label: 'Chase',
      initials: 'CH',
      badgeClassName: 'border-blue-700 bg-blue-950 text-blue-100',
    },
  },
  {
    aliases: ['U.S. BANK', 'US BANK', 'USBANK'],
    brand: {
      label: 'U.S. Bank',
      initials: 'US',
      badgeClassName: 'border-red-700 bg-red-950 text-red-100',
    },
  },
  {
    aliases: ['FIRSTBANK', 'FIRST BANK'],
    brand: {
      label: 'FirstBank',
      initials: 'FB',
      badgeClassName: 'border-cyan-700 bg-cyan-950 text-cyan-100',
    },
  },
  {
    aliases: ['SYNCHRONY'],
    brand: {
      label: 'Synchrony',
      initials: 'SY',
      badgeClassName: 'border-emerald-700 bg-emerald-950 text-emerald-100',
    },
  },
  {
    aliases: ['CITI', 'CITIBANK', 'BEST BUY'],
    brand: {
      label: 'Citi / Best Buy',
      initials: 'CB',
      badgeClassName: 'border-indigo-700 bg-indigo-950 text-indigo-100',
    },
  },
  {
    aliases: ['PEP BOYS'],
    brand: {
      label: 'Pep Boys',
      initials: 'PB',
      badgeClassName: 'border-amber-700 bg-amber-950 text-amber-100',
    },
  },
]

function normalizedText(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function initialsFor(value: string | null | undefined) {
  const words = normalizedText(value)
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return 'BK'
  if (words.length === 1) return words[0].slice(0, 2)

  return `${words[0][0]}${words[1][0]}`
}

function brandForInstitution(institution: string | null | undefined) {
  const normalized = normalizedText(institution)

  return institutionBrands.find(({ aliases }) =>
    aliases.some((alias) => normalized.includes(alias))
  )?.brand
}

export default function InstitutionLogo({
  institution,
  size = 'md',
  showLabel = false,
}: InstitutionLogoProps) {
  const brand = brandForInstitution(institution)
  const label = brand?.label || institution || 'Institución'
  const initials = brand?.initials || initialsFor(institution)
  const sizeClassName =
    size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-10 w-10 text-xs'
  const badgeClassName =
    brand?.badgeClassName ||
    'border-neutral-700 bg-neutral-800 text-neutral-100'

  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-label={label}
        className={`inline-flex shrink-0 items-center justify-center rounded border font-bold ${sizeClassName} ${badgeClassName}`}
        title={label}
      >
        {initials}
      </span>
      {showLabel ? (
        <span className="min-w-0 truncate text-neutral-200">{label}</span>
      ) : null}
    </span>
  )
}
