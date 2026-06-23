import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    next: 'Ahora necesitamos guardar el refresh_token en Supabase o .env.local temporalmente para leer Gmail.',
  })
}