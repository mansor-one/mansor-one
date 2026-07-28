export const UPDATE_MODE_ITEM_RETRY_DELAYS_MS = [0, 1_000, 3_000] as const

type PlaidItemLike = {
  error?: { error_code?: string | null } | null
  consent_expiration_time?: string | null
  update_type?: string | null
  institution_id?: string | null
  available_products?: string[] | null
  billed_products?: string[] | null
}

export type SafePlaidItemStatus = {
  errorCode: string | null
  consentExpirationTime: string | null
  updateType: string | null
  institutionId: string | null
  availableProducts: string[]
  billedProducts: string[]
}

export type UpdateModeItemCheck =
  | {
      state: 'healthy'
      attempts: number
      item: SafePlaidItemStatus
    }
  | {
      state: 'credentials_required'
      attempts: number
      item: SafePlaidItemStatus
    }
  | {
      state: 'item_check_failed'
      attempts: number
      errorCode: string
    }

export type BoundedRetryResult<T> = {
  result: T
  attempts: number
}

function safeItemStatus(item: PlaidItemLike): SafePlaidItemStatus {
  return {
    errorCode: item.error?.error_code || null,
    consentExpirationTime: item.consent_expiration_time || null,
    updateType: item.update_type || null,
    institutionId: item.institution_id || null,
    availableProducts: [...(item.available_products || [])],
    billedProducts: [...(item.billed_products || [])],
  }
}

function errorCodeFrom(error: unknown) {
  const plaidError = error as {
    response?: { data?: { error_code?: string } }
  }
  return plaidError.response?.data?.error_code || 'ITEM_GET_FAILED'
}

export async function verifyUpdatedPlaidItem({
  itemGet,
  sleep = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  onAttempt,
}: {
  itemGet: () => Promise<PlaidItemLike>
  sleep?: (milliseconds: number) => Promise<void>
  onAttempt?: (item: SafePlaidItemStatus, attempt: number) => void
}): Promise<UpdateModeItemCheck> {
  let lastItem: SafePlaidItemStatus | null = null

  for (const [index, delay] of UPDATE_MODE_ITEM_RETRY_DELAYS_MS.entries()) {
    if (delay > 0) await sleep(delay)

    try {
      const item = safeItemStatus(await itemGet())
      lastItem = item
      onAttempt?.(item, index + 1)

      if (!item.errorCode) {
        return { state: 'healthy', attempts: index + 1, item }
      }

      if (item.errorCode !== 'ITEM_LOGIN_REQUIRED') {
        return {
          state: 'item_check_failed',
          attempts: index + 1,
          errorCode: item.errorCode,
        }
      }
    } catch (error) {
      const errorCode = errorCodeFrom(error)
      if (errorCode === 'ITEM_LOGIN_REQUIRED') {
        lastItem = {
          errorCode,
          consentExpirationTime: null,
          updateType: null,
          institutionId: null,
          availableProducts: [],
          billedProducts: [],
        }
        onAttempt?.(lastItem, index + 1)
        continue
      }

      return {
        state: 'item_check_failed',
        attempts: index + 1,
        errorCode,
      }
    }
  }

  return {
    state: 'credentials_required',
    attempts: UPDATE_MODE_ITEM_RETRY_DELAYS_MS.length,
    item: lastItem || {
      errorCode: 'ITEM_LOGIN_REQUIRED',
      consentExpirationTime: null,
      updateType: null,
      institutionId: null,
      availableProducts: [],
      billedProducts: [],
    },
  }
}

export async function runWithPlaidBackoff<T>({
  run,
  shouldRetry,
  sleep = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
}: {
  run: () => Promise<T>
  shouldRetry: (result: T) => boolean
  sleep?: (milliseconds: number) => Promise<void>
}): Promise<BoundedRetryResult<T>> {
  let result: T | undefined

  for (const [index, delay] of UPDATE_MODE_ITEM_RETRY_DELAYS_MS.entries()) {
    if (delay > 0) await sleep(delay)
    result = await run()
    if (!shouldRetry(result)) return { result, attempts: index + 1 }
  }

  return {
    result: result as T,
    attempts: UPDATE_MODE_ITEM_RETRY_DELAYS_MS.length,
  }
}
