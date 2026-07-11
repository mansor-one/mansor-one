import { NextResponse } from 'next/server'
import {
  answerRobototinaQuestion,
  getRobototinaContext,
} from '@/lib/financial-engine'
import { createServerSupabase } from '@/lib/supabase/server'

function normalizeError(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

async function readQuestion(req: Request) {
  const body = await req.json()
  const question = body?.question

  if (typeof question !== 'string' || !question.trim()) {
    return { error: 'Invalid question' }
  }

  if (question.length > 500) {
    return { error: 'Question too long (max 500 characters)' }
  }

  return { question: question.trim() }
}

export async function POST(req: Request) {
  try {
    const parsed = await readQuestion(req)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { supabase } = await createServerSupabase()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const context = await getRobototinaContext(supabase, user.id)
    const response = answerRobototinaQuestion(parsed.question, context)

    return NextResponse.json({
      question: parsed.question,
      ...response,
    })
  } catch (error) {
    return NextResponse.json({ error: normalizeError(error) }, { status: 500 })
  }
}
