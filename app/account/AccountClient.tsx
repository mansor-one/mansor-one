'use client'

import { FormEvent, useState } from 'react'
import {
  validateEmailChange,
  validatePasswordChange,
  type PasswordValidation,
} from '@/lib/auth/account-security'

type AccountClientProps = {
  displayName: string
  currentEmail: string
  pendingEmail: string | null
  role: string
  membershipActive: boolean
  householdName: string
  canWriteHousehold: boolean
  lastUpdated: string | null
}

type RequestState = 'idle' | 'saving' | 'success' | 'error'

const inputClass = 'mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#07101f] px-3 py-2 text-white outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60'

function roleLabel(role: string) {
  if (role === 'owner') return 'Propietario'
  if (role === 'member') return 'Miembro'
  if (role === 'viewer') return 'Solo lectura'
  return 'Miembro'
}

async function jsonRequest(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: body === undefined ? 'POST' : url.includes('/profile') || url.includes('/household') ? 'PATCH' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const payload = await response.json()
  if (!response.ok) throw Object.assign(new Error(payload.error || 'No se pudo completar.'), { payload, status: response.status })
  return payload
}

function SectionMessage({ state, message }: { state: RequestState; message: string }) {
  if (!message) return null
  return (
    <p className={`mt-3 rounded-lg border p-3 text-sm ${state === 'success' ? 'border-emerald-300/20 bg-emerald-400/8 text-emerald-100' : 'border-rose-300/20 bg-rose-400/8 text-rose-100'}`} role={state === 'error' ? 'alert' : 'status'}>
      {message}
    </p>
  )
}

export default function AccountClient(props: AccountClientProps) {
  const [displayName, setDisplayName] = useState(props.displayName)
  const [householdName, setHouseholdName] = useState(props.householdName)
  const [currentEmail, setCurrentEmail] = useState(props.currentEmail)
  const [profileState, setProfileState] = useState<RequestState>('idle')
  const [profileMessage, setProfileMessage] = useState('')
  const [householdState, setHouseholdState] = useState<RequestState>('idle')
  const [householdMessage, setHouseholdMessage] = useState('')
  const [nextEmail, setNextEmail] = useState('')
  const [emailState, setEmailState] = useState<RequestState>('idle')
  const [emailMessage, setEmailMessage] = useState('')
  const [pendingEmail, setPendingEmail] = useState(props.pendingEmail)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nonce, setNonce] = useState('')
  const [requiresNonce, setRequiresNonce] = useState(false)
  const [passwordState, setPasswordState] = useState<RequestState>('idle')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<PasswordValidation>({})

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileState('saving')
    setProfileMessage('')
    try {
      const result = await jsonRequest('/api/account/profile', { name: displayName })
      setDisplayName(result.name)
      setProfileState('success')
      setProfileMessage('Nombre guardado.')
      window.dispatchEvent(new CustomEvent('mansor:account-updated'))
    } catch (error) {
      setProfileState('error')
      setProfileMessage(error instanceof Error ? error.message : 'No se pudo guardar el nombre.')
    }
  }

  async function updateHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHouseholdState('saving')
    setHouseholdMessage('')
    try {
      const result = await jsonRequest('/api/account/household', { name: householdName })
      setHouseholdName(result.name)
      setHouseholdState('success')
      setHouseholdMessage('Nombre del hogar guardado.')
      window.dispatchEvent(new CustomEvent('mansor:account-updated'))
    } catch (error) {
      setHouseholdState('error')
      setHouseholdMessage(error instanceof Error ? error.message : 'No se pudo guardar el hogar.')
    }
  }

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validateEmailChange(currentEmail, nextEmail)
    if (validationError) {
      setEmailState('error')
      setEmailMessage(validationError)
      return
    }
    setEmailState('saving')
    setEmailMessage('')
    try {
      const result = await jsonRequest('/api/account/email', { email: nextEmail })
      setPendingEmail(result.pendingEmail)
      if (result.status === 'completed' && result.currentEmail) {
        setCurrentEmail(result.currentEmail)
      }
      setNextEmail('')
      setEmailState('success')
      setEmailMessage(result.message)
    } catch (error) {
      setEmailState('error')
      setEmailMessage(error instanceof Error ? error.message : 'No se pudo iniciar el cambio de correo.')
    }
  }

  async function requestNonce() {
    setPasswordState('saving')
    setPasswordMessage('')
    try {
      await jsonRequest('/api/account/password/reauthenticate')
      setRequiresNonce(true)
      setPasswordState('success')
      setPasswordMessage('Código enviado. Revisa tu correo y escríbelo aquí para continuar.')
    } catch (error) {
      setPasswordState('error')
      setPasswordMessage(error instanceof Error ? error.message : 'No se pudo enviar el código.')
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validatePasswordChange({ currentPassword, newPassword, confirmPassword })
    setPasswordErrors(errors)
    if (Object.keys(errors).length > 0) return
    setPasswordState('saving')
    setPasswordMessage('')
    try {
      await jsonRequest('/api/account/password', {
        currentPassword,
        newPassword,
        confirmPassword,
        nonce: nonce || undefined,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNonce('')
      setRequiresNonce(false)
      setPasswordState('success')
      setPasswordMessage('Contraseña actualizada.')
    } catch (error) {
      const failure = error as Error & { payload?: { code?: string } }
      if (failure.payload?.code === 'reauthentication_required') setRequiresNonce(true)
      setPasswordState('error')
      setPasswordMessage(failure.message || 'No se pudo actualizar la contraseña.')
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-2xl border border-white/8 bg-white/[0.035] p-5 md:grid-cols-[auto_1fr] md:items-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-3xl font-bold text-white">
          {displayName.trim().charAt(0).toUpperCase() || '?'}
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-white">{displayName}</h2>
          <p className="mt-1 text-slate-300">{currentEmail}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1 text-indigo-100">{roleLabel(props.role)}</span>
            <span className={`rounded-full border px-3 py-1 ${props.membershipActive ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/20 bg-amber-400/10 text-amber-100'}`}>
              {props.membershipActive ? 'Membresía activa' : 'Membresía inactiva'}
            </span>
          </div>
          {props.lastUpdated && <p className="mt-3 text-xs text-slate-500">Cuenta actualizada: {new Date(props.lastUpdated).toLocaleDateString('es-PR')}</p>}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <form className="rounded-2xl border border-white/8 bg-white/[0.035] p-5" onSubmit={updateProfile}>
          <h2 className="text-xl font-semibold text-white">Información personal</h2>
          <p className="mt-1 text-sm text-slate-400">Este nombre identifica tu membresía dentro del hogar.</p>
          <label className="mt-4 block text-sm text-slate-200">Nombre para mostrar
            <input className={inputClass} disabled={profileState === 'saving'} maxLength={80} minLength={2} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
          </label>
          <button className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={profileState === 'saving'} type="submit">
            {profileState === 'saving' ? 'Guardando…' : 'Guardar nombre'}
          </button>
          <SectionMessage message={profileMessage} state={profileState} />
        </form>

        <form className="rounded-2xl border border-white/8 bg-white/[0.035] p-5" id="household" onSubmit={updateHousehold}>
          <h2 className="text-xl font-semibold text-white">Cuenta familiar</h2>
          <p className="mt-1 text-sm text-slate-400">Nombre visible del hogar en Mansor One.</p>
          <label className="mt-4 block text-sm text-slate-200">Nombre del household
            <input className={inputClass} disabled={!props.canWriteHousehold || householdState === 'saving'} maxLength={80} minLength={2} onChange={(event) => setHouseholdName(event.target.value)} required value={householdName} />
          </label>
          {props.canWriteHousehold ? (
            <button className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={householdState === 'saving'} type="submit">
              {householdState === 'saving' ? 'Guardando…' : 'Guardar household'}
            </button>
          ) : (
            <p className="mt-4 rounded-lg border border-amber-300/15 bg-amber-400/8 p-3 text-sm text-amber-100">Tu rol es de solo lectura. No puedes cambiar el nombre del hogar.</p>
          )}
          <SectionMessage message={householdMessage} state={householdState} />
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-2" id="security">
        <form className="rounded-2xl border border-white/8 bg-white/[0.035] p-5" onSubmit={updatePassword}>
          <h2 className="text-xl font-semibold text-white">Cambiar contraseña</h2>
          <p className="mt-1 text-sm text-slate-400">Supabase Auth protege y actualiza tu contraseña.</p>
          {[
            ['current', 'Contraseña actual', currentPassword, setCurrentPassword, passwordErrors.currentPassword],
            ['new', 'Nueva contraseña', newPassword, setNewPassword, passwordErrors.newPassword],
            ['confirm', 'Confirmar nueva contraseña', confirmPassword, setConfirmPassword, passwordErrors.confirmPassword],
          ].map(([id, label, fieldValue, setter, error]) => (
            <label className="mt-4 block text-sm text-slate-200" htmlFor={`password-${id}`} key={String(id)}>{String(label)}
              <input autoComplete={id === 'current' ? 'current-password' : 'new-password'} className={inputClass} id={`password-${id}`} onChange={(event) => (setter as (value: string) => void)(event.target.value)} type="password" value={String(fieldValue)} />
              {error && <span className="mt-1 block text-xs text-rose-300">{String(error)}</span>}
            </label>
          ))}
          {requiresNonce && <label className="mt-4 block text-sm text-slate-200">Código de seguridad
            <input autoComplete="one-time-code" className={inputClass} inputMode="numeric" onChange={(event) => setNonce(event.target.value)} value={nonce} />
          </label>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={passwordState === 'saving'} type="submit">Actualizar contraseña</button>
            {requiresNonce && <button className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 disabled:opacity-50" disabled={passwordState === 'saving'} onClick={requestNonce} type="button">Enviar código</button>}
          </div>
          <SectionMessage message={passwordMessage} state={passwordState} />
        </form>

        <form className="rounded-2xl border border-white/8 bg-white/[0.035] p-5" onSubmit={requestEmailChange}>
          <h2 className="text-xl font-semibold text-white">Correo de acceso</h2>
          <p className="mt-1 text-sm text-slate-400">Correo actual administrado exclusivamente por Supabase Auth.</p>
          <div className="mt-4 rounded-lg border border-white/8 bg-black/10 p-3">
            <p className="text-xs text-slate-500">Correo actual</p>
            <p className="font-semibold text-white">{currentEmail}</p>
          </div>
          {pendingEmail && <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-400/8 p-3 text-sm text-amber-100"><strong>Cambio pendiente:</strong> {pendingEmail}. El correo actual seguirá visible hasta que Supabase complete la confirmación.</div>}
          <label className="mt-4 block text-sm text-slate-200">Nuevo correo
            <input autoCapitalize="none" autoComplete="email" className={inputClass} inputMode="email" onChange={(event) => setNextEmail(event.target.value)} type="email" value={nextEmail} />
          </label>
          <button className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={emailState === 'saving'} type="submit">
            {emailState === 'saving' ? 'Solicitando…' : 'Solicitar cambio'}
          </button>
          <SectionMessage message={emailMessage} state={emailState} />
        </form>
      </section>

      <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-5" id="preferences">
        <h2 className="text-xl font-semibold text-white">Preferencias efectivas</h2>
        <p className="mt-1 text-sm text-slate-400">Información read-only en esta fase. No existe todavía una tabla de preferencias.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ['Idioma y locale', 'Español · es-PR'],
            ['Moneda', 'USD'],
            ['Zona horaria', 'America/Puerto_Rico'],
          ].map(([label, value]) => <div className="rounded-xl border border-white/8 bg-black/10 p-4" key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-white">{value}</p></div>)}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {['Avatar y logo', 'MFA / 2FA', 'Sesiones activas'].map((feature) => <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4" key={feature}><p className="font-semibold text-slate-200">{feature}</p><p className="mt-1 text-sm text-slate-500">Próximamente</p></div>)}
      </section>
    </div>
  )
}
