export function activeScheduledPaymentRows<
  T extends { is_active?: boolean | null },
>(payments: T[]) {
  return payments.filter((payment) => payment.is_active !== false)
}

export function safeLegacyConfigurationError(error: unknown) {
  const record = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : {}
  const code = typeof record.code === 'string' ? record.code : 'unknown'
  const message = typeof record.message === 'string' ? record.message : ''

  if (code === 'P0002' && message.includes('Confirmed payment transaction not found')) {
    return {
      status: 409,
      code: 'legacy_evidence_not_accepted',
      message: 'La transacción seleccionada existe, pero el flujo legacy todavía no acepta este tipo de evidencia financiera.',
    }
  }
  if (code === '23505') {
    return {
      status: 409,
      code: 'legacy_evidence_already_linked',
      message: 'La transacción seleccionada ya está vinculada a otra obligación.',
    }
  }
  if (code === '42501') {
    return {
      status: 403,
      code: 'legacy_household_forbidden',
      message: 'No tienes autorización para configurar esta obligación del hogar.',
    }
  }
  if (code === '22023') {
    return {
      status: 400,
      code: 'legacy_configuration_invalid',
      message: 'La configuración contiene un monto, fecha o frecuencia inválida.',
    }
  }

  return {
    status: 500,
    code: 'legacy_configuration_failed',
    message: 'No se pudo migrar y conciliar esta obligación.',
  }
}
