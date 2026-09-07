import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/requireUser'
import AppShell from '@/app/components/AppShell'
import AccountClient from './AccountClient'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const { supabase, user } = await requireUser()
  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id, name, role, active')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) notFound()

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('name')
    .eq('id', membership.household_id)
    .maybeSingle()
  if (householdError) throw householdError
  if (!household) notFound()

  return (
    <AppShell
      header={{
        eyebrow: 'Cuenta y configuración',
        title: 'Mi cuenta',
        subtitle: 'Administra tu identidad, acceso y preferencias visibles sin mezclar estos datos con el ledger financiero.',
      }}
    >
      <AccountClient
        canWriteHousehold={['owner', 'member'].includes(membership.role)}
        currentEmail={user.email || 'Correo no disponible'}
        displayName={membership.name}
        householdName={household.name}
        lastUpdated={user.updated_at || null}
        membershipActive={membership.active !== false}
        pendingEmail={user.new_email || null}
        role={membership.role}
      />
    </AppShell>
  )
}
