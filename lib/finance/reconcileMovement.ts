import type { FinancialSupabaseClient } from '@/lib/financial-engine'

type Movement = {
  description?: string | null
  amount?: number | string | null
  entry_date?: string | null
  transaction_date?: string | null
}

type PaymentInstanceRow = {
  id: string
  name?: string | null
  amount?: number | string | null
  notes?: string | null
}

type FutureObligationRow = {
  id: string
  name?: string | null
  estimated_amount?: number | string | null
  notes?: string | null
}

export async function reconcileMovement(
  supabase: FinancialSupabaseClient,
  movement: Movement
) {
  const description = String(movement.description || '').toLowerCase()
  const amount = Math.abs(Number(movement.amount || 0))
  const date = movement.entry_date || movement.transaction_date || new Date().toISOString().slice(0, 10)

  if (!amount || !description) return

  const { data: payments } = await supabase
    .from('payment_instances')
    .select('*')
    .neq('status', 'paid')

  const paymentRows = ((payments || []) as unknown[]) as PaymentInstanceRow[]
  const matchedPayment = paymentRows.find((payment) => {
    const paymentAmount = Math.abs(Number(payment.amount || 0))
    const name = String(payment.name || '').toLowerCase()

    const amountMatches = Math.abs(paymentAmount - amount) <= 2
    const nameMatches =
      description.includes(name) ||
      name.includes(description) ||
      description.includes('water') && name.includes('agua') ||
      description.includes('aee') && name.includes('luz') ||
      description.includes('luma') && name.includes('luz') ||
      description.includes('synchrony') && name.includes('synchrony') ||
      description.includes('coop') && name.includes('coop') ||
      description.includes('lares') && name.includes('lares')

    return amountMatches && nameMatches
  })

  if (matchedPayment) {
    await supabase
      .from('payment_instances')
      .update({
        status: 'paid',
        notes: `${matchedPayment.notes || ''} | Auto marcado pagado por movimiento ${movement.description} el ${date}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchedPayment.id)

    return
  }

  const { data: obligations } = await supabase
    .from('future_obligations')
    .select('*')
    .neq('status', 'paid')

  const obligationRows = ((obligations || []) as unknown[]) as FutureObligationRow[]
  const matchedObligation = obligationRows.find((item) => {
    const itemAmount = Math.abs(Number(item.estimated_amount || 0))
    const name = String(item.name || '').toLowerCase()

    const amountMatches = Math.abs(itemAmount - amount) <= 5
    const nameMatches =
      description.includes(name) ||
      name.includes(description) ||
      description.includes('marbete') && name.includes('marbete')

    return amountMatches && nameMatches
  })

  if (matchedObligation) {
    await supabase
      .from('future_obligations')
      .update({
        status: 'paid',
        notes: `${matchedObligation.notes || ''} | Auto marcado pagado por movimiento ${movement.description} el ${date}`,
      })
      .eq('id', matchedObligation.id)
  }
}
