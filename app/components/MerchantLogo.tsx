'use client'

import Image from 'next/image'
import { useState } from 'react'

function initials(value: string | null | undefined) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean)
  return words.length > 1 ? `${words[0][0]}${words[1][0]}`.toUpperCase() : (words[0]?.slice(0, 2) || 'TX').toUpperCase()
}

export default function MerchantLogo({ merchant, plaidImportId, size = 'md' }: {
  merchant?: string | null
  plaidImportId?: string | null
  size?: 'sm' | 'md'
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const pixels = size === 'sm' ? 28 : 40
  const classes = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-10 w-10 text-xs'
  return (
    <span aria-label={merchant || 'Comercio'} className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-600 bg-slate-800 font-bold text-slate-100 ${classes}`} title={merchant || 'Comercio'}>
      {initials(merchant)}
      {plaidImportId && !failed ? <Image alt="" className={`absolute inset-0 bg-white object-contain transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`} height={pixels} onError={() => setFailed(true)} onLoad={() => setLoaded(true)} src={`/api/plaid/assets/merchants/${encodeURIComponent(plaidImportId)}`} unoptimized width={pixels} /> : null}
    </span>
  )
}
