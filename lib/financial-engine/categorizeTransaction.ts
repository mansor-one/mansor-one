export function categorizeTransaction(
  merchant: string,
  plaidPrimary: string | null
) {
  const upperMerchant = merchant.toUpperCase()
  const includesAny = (patterns: string[]) =>
    patterns.some((pattern) => upperMerchant.includes(pattern))

  if (
    includesAny([
      'CHURCH',
      "CHURCH'S",
      'CHURCHS',
      'STARBUCKS',
      'MC DONALDS',
      'MCDONALD',
      'BURGER KING',
      'WENDY',
      'KFC',
      'TACO BELL',
      'PIZZA',
      'DOMINO',
      'PAPA JOHN',
      'SUBWAY',
      'CHICK-FIL-A',
      'RESTAURANT',
      'CAFETERIA',
      'FIREHOUSE',
      'EXCELL',
    ])
  ) {
    return 'Comida fuera'
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

  if (
    includesAny([
      'CREDIT CARD PAYMENT',
      'CR CARD PAYMENT',
      'POPULAR CR CARD PAYMENT',
      'U.S. BANK RETRY PYMT',
      'EFT PMT',
      'PAYMENT',
    ])
  ) {
    return 'Pago de tarjeta'
  }

  if (
    includesAny([
      'TRANF ATHM',
      'ATHM',
      'ATH MOVIL',
      'ATH MÓVIL',
      'TRANSFER',
    ])
  ) {
    return 'Transferencia'
  }

  return 'Revisar'
}
