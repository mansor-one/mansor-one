type QueryValue = string | number | null | undefined

function drilldown(path: string, anchor: string, values: Record<string, QueryValue>) {
  const query = new URLSearchParams()

  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  })

  return `${path}?${query.toString()}#${anchor}`
}

export function spendingDrilldown(values: Record<string, QueryValue>) {
  return drilldown('/spending', 'dashboard-calculation', values)
}

export function timelineDrilldown(values: Record<string, QueryValue>) {
  return drilldown('/timeline', 'dashboard-calculation', values)
}

export function reviewQueueDrilldown(
  tab: string,
  subset?: string,
  filters: Record<string, QueryValue> = {}
) {
  return drilldown('/robototina/review', 'queue', { tab, subset, ...filters })
}
