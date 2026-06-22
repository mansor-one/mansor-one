import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getFinancialDecisionContext } from '@/lib/pablo/getFinancialDecisionContext'
import { answerQuestion } from '@/lib/pablo/answerQuestion'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const question = body?.question

    if (typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'Invalid question' }, { status: 400 })
    }

    if (question.length > 500) {
      return NextResponse.json({ error: 'Question too long (max 500 characters)' }, { status: 400 })
    }

    const { supabase } = await createServerSupabase()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const ctx = await getFinancialDecisionContext(supabase)
    const answer = answerQuestion(question, ctx)
    return NextResponse.json({ answer })
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 })
  }
}
