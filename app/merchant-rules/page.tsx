import { requireUser } from '@/lib/auth/requireUser'
import Nav from '../components/Nav'
import RuleCard, { type MerchantRule } from './RuleCard'

export const dynamic = 'force-dynamic'

type MerchantRulesPageProps = {
  searchParams?: Promise<{
    error?: string
    saved?: string
  }>
}

export default async function MerchantRulesPage({
  searchParams,
}: MerchantRulesPageProps) {
  const params = (await searchParams) || {}
  const { supabase } = await requireUser()
  const { data: rules, error } = await supabase
    .from('merchant_rules')
    .select(
      'id, merchant_keyword, suggested_category, default_transaction_type, confidence_score, notes'
    )
    .order('merchant_keyword')

  const items = ((rules || []) as MerchantRule[])

  return (
    <main className="space-y-6 p-8">
      <h1 className="text-4xl font-bold">Merchant Rules</h1>

      <Nav />
      <p>Total reglas: {items.length}</p>

      {params.saved === 'updated' && (
        <div className="rounded border p-4">Regla actualizada</div>
      )}

      {(params.error || error) && (
        <div className="rounded border p-4 text-red-400">
          {params.error || error?.message}
        </div>
      )}

      <section className="space-y-3">
        {items.map((rule) => (
          <RuleCard key={rule.id} rule={rule} />
        ))}
      </section>
    </main>
  )
}
