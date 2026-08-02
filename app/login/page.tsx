'use client'

import { FormEvent, useRef, useState } from 'react'
import {
  loginErrorMessage,
  validateLoginInput,
  type LoginFieldErrors,
} from '@/lib/auth/login-experience'
import { getSafeRedirectPath } from '@/lib/auth/redirects'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({})
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [supabase] = useState(createClient)
  const submittingRef = useRef(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current) return

    const errors = validateLoginInput(email, password)
    setFieldErrors(errors)
    setMessage('')

    if (errors.email) {
      emailRef.current?.focus()
      return
    }

    if (errors.password) {
      passwordRef.current?.focus()
      return
    }

    submittingRef.current = true
    setSubmitting(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setMessage(loginErrorMessage(error))
        return
      }

      const searchParams = new URLSearchParams(window.location.search)
      const nextPath = searchParams.get('next')
      const redirectTo = getSafeRedirectPath(nextPath)
      window.location.href = redirectTo
    } catch (error) {
      setMessage(loginErrorMessage(error))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#07101f] text-slate-100">
      <div className="relative mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden border-r border-white/8 px-12 py-14 lg:flex lg:flex-col lg:justify-between xl:px-20 xl:py-16">
          <div aria-hidden="true" className="absolute inset-0">
            <div className="absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.045)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
          </div>

          <div className="relative flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-2xl font-black text-white shadow-[0_0_40px_rgba(139,92,246,0.35)]">
              M
            </span>
            <span>
              <span className="block text-base font-semibold text-white">Mansor One</span>
              <span className="block text-sm text-slate-400">Finanzas para el hogar</span>
            </span>
          </div>

          <div className="relative max-w-2xl py-16">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-300">
              Un espacio privado para su hogar
            </p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.08] tracking-tight text-white xl:text-6xl">
              Tus finanzas familiares, organizadas en un solo lugar.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Una vista clara de sus cuentas, compromisos y planes para tomar decisiones juntos con confianza.
            </p>

            <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-3">
              {[
                ['⌂', 'Hogar', 'Una realidad financiera compartida'],
                ['◎', 'Claridad', 'Cada número puede explicarse'],
                ['◇', 'Planificación', 'Prioridades siempre visibles'],
              ].map(([icon, title, description]) => (
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur" key={title}>
                  <span aria-hidden="true" className="text-xl text-indigo-300">{icon}</span>
                  <p className="mt-3 font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-400">{description}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="relative text-sm text-slate-500">
            Acceso exclusivo para Manuel y Soraya.
          </p>
        </section>

        <section className="relative flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden lg:hidden">
            <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
          </div>

          <div className="relative w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xl font-black text-white shadow-[0_0_32px_rgba(139,92,246,0.3)]">
                M
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Mansor One</span>
                <span className="block text-xs text-slate-400">Finanzas para el hogar</span>
              </span>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#0d1728]/95 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur sm:p-9">
              <div>
                <p className="text-sm font-semibold text-indigo-300">Bienvenidos</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                  Iniciar sesión
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Ingresa con la cuenta autorizada de tu hogar.
                </p>
              </div>

              <form className="mt-8 space-y-5" noValidate onSubmit={login}>
                <div>
                  <label className="text-sm font-medium text-slate-200" htmlFor="email">
                    Correo electrónico
                  </label>
                  <input
                    aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                    aria-invalid={Boolean(fieldErrors.email)}
                    autoCapitalize="none"
                    autoComplete="email"
                    className="mt-2 min-h-12 w-full rounded-xl border border-white/12 bg-[#07101f] px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={submitting}
                    id="email"
                    inputMode="email"
                    name="email"
                    onChange={(event) => {
                      setEmail(event.target.value)
                      if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }))
                    }}
                    placeholder="nombre@correo.com"
                    ref={emailRef}
                    required
                    type="email"
                    value={email}
                  />
                  <p className="mt-2 min-h-5 text-sm text-rose-300" id="email-error">
                    {fieldErrors.email || ''}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-200" htmlFor="password">
                    Contraseña
                  </label>
                  <div className="relative mt-2">
                    <input
                      aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                      aria-invalid={Boolean(fieldErrors.password)}
                      autoComplete="current-password"
                      className="min-h-12 w-full rounded-xl border border-white/12 bg-[#07101f] py-3 pl-4 pr-24 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={submitting}
                      id="password"
                      name="password"
                      onChange={(event) => {
                        setPassword(event.target.value)
                        if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }))
                      }}
                      placeholder="Tu contraseña"
                      ref={passwordRef}
                      required
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                    />
                    <button
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute inset-y-1 right-1 min-w-20 rounded-lg px-3 text-sm font-semibold text-indigo-200 outline-none transition hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={submitting}
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                    >
                      {showPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                  <p className="mt-2 min-h-5 text-sm text-rose-300" id="password-error">
                    {fieldErrors.password || ''}
                  </p>
                </div>

                <div aria-atomic="true" aria-live="polite" className="min-h-12">
                  {message ? (
                    <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
                      {message}
                    </p>
                  ) : null}
                </div>

                <button
                  className="flex min-h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 font-semibold text-white shadow-[0_14px_38px_rgba(99,102,241,0.25)] outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1728] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
                  disabled={submitting}
                  type="submit"
                >
                  {submitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
                </button>
              </form>

              <p className="mt-6 text-center text-xs leading-5 text-slate-500">
                Sistema financiero privado del hogar. El acceso está limitado a cuentas autorizadas.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
