import { requireUser } from '@/lib/auth/requireUser'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AccountsPage() {
  await requireUser()
  redirect('/portfolio')
}
