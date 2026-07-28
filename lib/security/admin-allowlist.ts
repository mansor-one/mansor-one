export function parseAdminEmailAllowlist(value: string | undefined) {
  if (value === undefined || value === '') return new Set<string>()

  const emails = value.split(',').map((email) => email.trim().toLowerCase())
  const validEmail = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/

  if (emails.some((email) => !validEmail.test(email))) {
    return new Set<string>()
  }

  return new Set(emails)
}
