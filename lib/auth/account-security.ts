type AuthErrorLike = {
  code?: unknown
  message?: unknown
  status?: unknown
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type PasswordValidation = {
  currentPassword?: string
  newPassword?: string
  confirmPassword?: string
}

export function validatePasswordChange({
  currentPassword,
  newPassword,
  confirmPassword,
}: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}): PasswordValidation {
  const errors: PasswordValidation = {}
  if (!currentPassword) errors.currentPassword = 'Escribe tu contraseña actual.'
  if (!newPassword) {
    errors.newPassword = 'Escribe una contraseña nueva.'
  } else if (newPassword.length < 8) {
    errors.newPassword = 'Usa al menos 8 caracteres.'
  }
  if (!confirmPassword) {
    errors.confirmPassword = 'Confirma la contraseña nueva.'
  } else if (newPassword !== confirmPassword) {
    errors.confirmPassword = 'Las contraseñas nuevas no coinciden.'
  }
  if (currentPassword && newPassword && currentPassword === newPassword) {
    errors.newPassword = 'La contraseña nueva debe ser diferente.'
  }
  return errors
}

export function validateEmailChange(currentEmail: string, nextEmail: string) {
  const normalized = nextEmail.trim().toLowerCase()
  if (!normalized) return 'Escribe el correo nuevo.'
  if (!EMAIL_PATTERN.test(normalized)) return 'Escribe un correo válido.'
  if (normalized === currentEmail.trim().toLowerCase()) {
    return 'El correo nuevo debe ser diferente al actual.'
  }
  return null
}

export function authAccountError(error: unknown) {
  const authError = error && typeof error === 'object'
    ? error as AuthErrorLike
    : {}
  const code = String(authError.code || '').toLowerCase()
  const message = String(authError.message || '').toLowerCase()

  if (code === 'reauthentication_needed' || code === 'reauth_nonce_missing') {
    return {
      code: 'reauthentication_required',
      message: 'Por seguridad, confirma tu identidad con el código que Supabase enviará a tu correo.',
    }
  }
  if (code === 'reauthentication_not_valid' || code === 'otp_expired') {
    return {
      code: 'invalid_nonce',
      message: 'El código no es válido o expiró. Solicita uno nuevo.',
    }
  }
  if (code === 'invalid_credentials' || message.includes('current password')) {
    return {
      code: 'invalid_current_password',
      message: 'La contraseña actual no es correcta.',
    }
  }
  if (code === 'weak_password') {
    return {
      code: 'weak_password',
      message: 'La contraseña no cumple los requisitos de seguridad.',
    }
  }
  if (code === 'same_password') {
    return {
      code: 'same_password',
      message: 'La contraseña nueva debe ser diferente a la actual.',
    }
  }
  if (code.includes('email') || message.includes('email')) {
    return {
      code: 'email_change_failed',
      message: 'No se pudo iniciar el cambio de correo. Verifica la dirección e inténtalo nuevamente.',
    }
  }
  if (Number(authError.status) === 429 || code.includes('rate_limit')) {
    return {
      code: 'rate_limited',
      message: 'Espera unos minutos antes de intentarlo nuevamente.',
    }
  }
  return {
    code: 'account_update_failed',
    message: 'No se pudo completar el cambio. Inténtalo nuevamente.',
  }
}
