import Nav from '../components/Nav'
import ImportsClient from './ImportsClient'
import { requireUser } from '@/lib/auth/requireUser'

export default async function ImportsPage() {
  await requireUser()

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-4xl font-bold">📥 Email Import Preview</h1>

      <Nav />

      <ImportsClient />
    </main>
  )
}
