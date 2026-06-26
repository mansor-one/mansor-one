export function categorizeTransaction(
  merchant: string,
  plaidPrimary: string | null
) {
  const upperMerchant = merchant.toUpperCase()

  if (
    upperMerchant.includes('MC DONALDS') ||
    upperMerchant.includes('MCDONALDS') ||
    upperMerchant.includes('BURGER KING') ||
    upperMerchant.includes('FIREHOUSE')
  ) {
    return 'Fast Food'
  }

  if (upperMerchant.includes('ECONO')) return 'Supermercado'

  if (
    upperMerchant.includes('WALGREENS') ||
    upperMerchant.includes('FARMACIA')
  ) {
    return 'Farmacia'
  }

  if (
    upperMerchant.includes('FUEL') ||
    upperMerchant.includes('TOTAL SER') ||
    upperMerchant.includes('TO GO STORES') ||
    upperMerchant.includes('JUNITO')
  ) {
    return 'Gasolina'
  }

  if (upperMerchant.includes('COOP LARES')) return 'Deuda - Lares'
  if (upperMerchant.includes('ATH MOVIL PHONE')) return 'Transferencia'

  if (
    upperMerchant.includes('APPLE') ||
    upperMerchant.includes('NINTENDO')
  ) {
    return 'Suscripciones'
  }

  if (upperMerchant.includes('EST MULTIPISO')) return 'Parking'
  if (upperMerchant.includes('LAB CLIN')) return 'Laboratorio'
  if (upperMerchant === 'ATM/POS') return 'Efectivo'

  if (
    upperMerchant.includes('CHECK DEPOSIT') ||
    upperMerchant.includes('INTEREST PAID')
  ) {
    return 'Ingreso'
  }

  if (plaidPrimary === 'ENTERTAINMENT') return 'Entretenimiento'

  return 'Revisar'
}