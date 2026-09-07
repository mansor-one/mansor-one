import { decodeValidatedPlaidPng } from './logo-proxy.ts'

export type PlaidInstitutionMetadata = {
  institution_id: string
  official_name: string
  logo_base64: string | null
  website: string | null
  primary_color: string | null
}

export function selectInstitutionMetadata(institution: {
  institution_id?: string | null
  name?: string | null
  logo?: string | null
  url?: string | null
  primary_color?: string | null
}): PlaidInstitutionMetadata | null {
  if (!institution.institution_id || !institution.name) return null
  const logo = institution.logo && decodeValidatedPlaidPng(institution.logo)
    ? institution.logo
    : null
  const website = (() => {
    if (!institution.url) return null
    try {
      const url = new URL(institution.url)
      return url.protocol === 'https:' ? url.toString() : null
    } catch { return null }
  })()
  const primaryColor = institution.primary_color && /^#[0-9a-f]{6}$/i.test(institution.primary_color)
    ? institution.primary_color
    : null
  return {
    institution_id: institution.institution_id,
    official_name: institution.name,
    logo_base64: logo,
    website,
    primary_color: primaryColor,
  }
}
