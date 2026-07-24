import {
  buildReconciliationMatches,
  type ReconciliationPaymentInstance,
} from '@/lib/financial-engine/reconciliation'
import type {
  FinancialSupabaseClient,
  PaymentInstance,
} from '@/lib/financial-engine/types'

type Movement = {
  id?: string | null
  description?: string | null
  amount?: number | string | null
  entry_date?: string | null
  transaction_date?: string | null
}

function reconciliationPayment(payment: PaymentInstance): ReconciliationPaymentInstance {
  return {
    id: payment.id,
    name: payment.name || null,
    amount: Number(payment.amount || 0),
    status: payment.status || null,
    effective_due_date: payment.effective_due_date || payment.grace_due_date || payment.due_date || payment.expected_date || null,
    updated_at: payment.updated_at || null,
    notes: payment.notes || null,
    scheduled_payment_id: payment.scheduled_payment_id || null,
  }
}

export async function reconcileMovement(supabase: FinancialSupabaseClient, movement: Movement) {
  const description = String(movement.description || '').trim()
  const amount = Math.abs(Number(movement.amount || 0))
  const date = movement.entry_date || movement.transaction_date || new Date().toISOString().slice(0, 10)
  if (!amount || !description) return { status: 'ignored' as const, reason: 'Movement lacks amount or description.' }

  const { data, error } = await supabase
    .from('payment_instances')
    .select('*')
    .in('status', ['pending', 'initiated', 'promise'])
  if (error) throw error

  const payments = (data || []) as PaymentInstance[]
  const result = buildReconciliationMatches({
    transactions: [{ source: 'quick_entries', id: movement.id || `movement:${date}:${amount}:${description}`, name: description, amount, date }],
    payments: payments.map(reconciliationPayment),
  })
  const reliable = result.allMatches.filter((match) => match.confidence >= 70)

  // A posted ledger movement may close one payment only when the shared scorer
  // produces one unambiguous candidate. Exact amount by itself is capped below
  // this threshold by the reconciliation engine.
  if (reliable.length !== 1) {
    return {
      status: reliable.length > 1 ? 'needs_review' as const : 'unmatched' as const,
      reason: reliable.length > 1
        ? 'Multiple payment instances are plausible for this movement.'
        : 'No unique reliable payment match was found.',
    }
  }

  const match = reliable[0]
  const payment = payments.find((item) => item.id === match.paymentInstanceId)
  if (!payment) return { status: 'unmatched' as const, reason: 'Matched payment is no longer open.' }

  const { error: updateError } = await supabase
    .from('payment_instances')
    .update({
      status: 'paid',
      notes: `${payment.notes || ''} | Confirmed by unique ledger match ${description} on ${date} (${match.confidence}% confidence)`.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id)
    .in('status', ['pending', 'initiated', 'promise'])
  if (updateError) throw updateError

  return { status: 'matched' as const, paymentInstanceId: payment.id, confidence: match.confidence }
}
