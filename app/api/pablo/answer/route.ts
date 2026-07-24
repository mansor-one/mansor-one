import { NextResponse } from 'next/server'

const RETIRED_PABLO_RESPONSE = {
  error: 'Pablo advisor API is retired.',
  canonicalRoute: '/api/robototina/answer',
  replacement: 'Use Robototina Q&A with the official Financial Engine context.',
}

export async function POST(req: Request) {
  await req.body?.cancel()
  return NextResponse.json(RETIRED_PABLO_RESPONSE, { status: 410 })
}

export async function GET() {
  return NextResponse.json(RETIRED_PABLO_RESPONSE, { status: 410 })
}
