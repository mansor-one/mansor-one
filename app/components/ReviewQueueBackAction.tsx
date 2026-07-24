'use client'

import { useRouter } from 'next/navigation'
import type { MouseEvent } from 'react'

const fallbackHref = '/robototina'

export default function ReviewQueueBackAction() {
  const router = useRouter()

  function goBack(event: MouseEvent<HTMLAnchorElement>) {
    const referrer = document.referrer
    if (referrer) {
      const origin = new URL(referrer).origin
      if (origin === window.location.origin && referrer !== window.location.href) {
        event.preventDefault()
        router.back()
      }
    }
  }

  return (
    <a
      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
      href={fallbackHref}
      onClick={goBack}
    >
      <span aria-hidden="true">←</span> Volver
    </a>
  )
}
