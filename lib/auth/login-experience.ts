export type LoginFieldErrors = {
  email?: string
  password?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateLoginInput(
  email: string,
  password: string
): LoginFieldErrors {
  const errors: LoginFieldErrors = {}
  const normalizedEmail = email.trim()

  if (!normalizedEmail) {
    errors.email = 'Escribe tu correo electrónico.'
  } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
    errors.email = 'Escribe un correo electrónico válido.'
  }

  if (!password) {
    errors.password = 'Escribe tu contraseña.'
  }

  return errors
}

type AuthErrorShape = {
  code?: unknown
  message?: unknown
  status?: unknown
}

export function loginErrorMessage(error: unknown): string {
  const authError =
    error && typeof error === 'object' ? (error as AuthErrorShape) : {}
  const code = String(authError.code || '').toLowerCase()
  const message = String(authError.message || '').toLowerCase()
  const status = Number(authError.status)

  if (
    code === 'invalid_credentials' ||
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    status === 400
  ) {
    return 'Correo o contraseña incorrectos.'
  }

  if (
    code.includes('session') ||
    message.includes('session expired') ||
    message.includes('jwt expired')
  ) {
    return 'Tu sesión expiró. Inicia sesión nuevamente.'
  }

  if (
    code.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('failed to fetch') ||
    message.includes('network')
  ) {
    return 'No pudimos conectarnos. Intenta nuevamente.'
  }

  if (
    status === 401 ||
    status === 403 ||
    code.includes('forbidden') ||
    message.includes('household')
  ) {
    return 'Tu cuenta no tiene acceso a este hogar.'
  }

  return 'No pudimos iniciar sesión. Intenta nuevamente.'
}
