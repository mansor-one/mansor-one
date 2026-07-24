'use client'

import { useState } from 'react'
import { getSafeRedirectPath } from '@/lib/auth/redirects'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const supabase = createClient()

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    const searchParams = new URLSearchParams(window.location.search)
    const nextPath = searchParams.get('next')
    const redirectTo = getSafeRedirectPath(nextPath)
    window.location.href = redirectTo
  }

  async function signup() {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Usuario creado. Revisa tu email si Supabase pide confirmación.')
  }

  return (
    <main className="p-8 max-w-md space-y-4">
      <h1 className="text-4xl font-bold">🔐 Login</h1>

      <input
        className="border rounded p-3 w-full"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        className="border rounded p-3 w-full"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button className="border rounded p-3 w-full" onClick={login}>
        Entrar
      </button>

      <button className="border rounded p-3 w-full" onClick={signup}>
        Crear usuario
      </button>

      {message && <p>{message}</p>}
    </main>
  )
}
