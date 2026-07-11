import { redirect } from 'next/navigation'

type AdvisorSearchParams = Record<string, string | string[] | undefined>

type AdvisorCompatibilityPageProps = {
  searchParams?: Promise<AdvisorSearchParams>
}

function buildRobototinaRedirect(params: AdvisorSearchParams | undefined) {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) query.append(key, item)
      }
      continue
    }

    if (value != null) query.set(key, value)
  }

  const suffix = query.toString()
  return suffix ? `/robototina?${suffix}` : '/robototina'
}

export default async function AdvisorCompatibilityPage({
  searchParams,
}: AdvisorCompatibilityPageProps) {
  redirect(buildRobototinaRedirect(await searchParams))
}
