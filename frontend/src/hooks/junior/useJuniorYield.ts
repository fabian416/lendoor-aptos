'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { LENDOOR_CONTRACT, WUSDC_TYPE } from '@/lib/constants'
import { decRaw, SECONDS_PER_YEAR } from '@/lib/utils'

/** Read junior PPS in Decimal 1e9 scale. Tries a few common view names. */
async function readJuniorPpsScaled(aptos: any): Promise<bigint | null> {
  const candidates = [
    `${LENDOOR_CONTRACT}::junior::pps_scaled`,           // Decimal(1e9)
    `${LENDOOR_CONTRACT}::junior::pps`,                  // Decimal(1e9)
    `${LENDOOR_CONTRACT}::junior::price_per_share`,      // Decimal or struct
    `${LENDOOR_CONTRACT}::junior::current_exchange_rate` // Decimal or struct
  ]
  for (const fn of candidates) {
    try {
      const out = await aptos.view({
        payload: { function: fn, typeArguments: [WUSDC_TYPE], functionArguments: [] },
      })
      const v = out?.[0]
      if (v == null) continue
      // Accept Decimal-like struct or raw u128 in 1e9 scale
      const scaled = decRaw(v)
      if (scaled > 0n) return scaled
    } catch {
      // try next candidate
    }
  }
  return null
}

/**
 * Junior yield (APR/APY) estimated from PPS deltas.
 * PPS is sampled in Decimal 1e9 scale and converted to per-second rate.
 */
export function useJuniorYield({ pollMs = 30_000, minSampleSec = 10 }: { pollMs?: number; minSampleSec?: number } = {}) {
  const { aptos } = useAptos()

  const [apr, setApr] = React.useState<number | null>(null)
  const [apy, setApy] = React.useState<number | null>(null)
  const [loading, setLoading] = React.useState(false)
  const prevRef = React.useRef<{ pps: bigint; t: number } | null>(null)

  /** Refresh once: read PPS and, if we have a prior sample, compute APR/APY. */
  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const ps = await readJuniorPpsScaled(aptos)
      if (ps == null || ps === 0n) return

      const now = Math.floor(Date.now() / 1000)
      const prev = prevRef.current
      prevRef.current = { pps: ps, t: now }
      if (!prev || now <= prev.t) return

      const dt = now - prev.t
      if (dt < minSampleSec || ps === prev.pps) return

      // ratio = (ps / prev.pps) - 1, computed safely in integers
      const SCALE = 1_000_000_000_000n
      const dScaled = (ps - prev.pps) * SCALE / prev.pps
      const ratio = Number(dScaled) / Number(SCALE)

      const rps = ratio / dt
      const apr_ = rps * SECONDS_PER_YEAR
      const apy_ = Math.expm1(rps * SECONDS_PER_YEAR)

      setApr(apr_)
      setApy(apy_)
    } finally {
      setLoading(false)
    }
  }, [aptos, minSampleSec])

  React.useEffect(() => {
    void refresh()
    if (!pollMs) return
    const id = setInterval(() => void refresh(), pollMs)
    return () => clearInterval(id)
  }, [refresh, pollMs])

  const fmt = (x: number | null) => (x == null ? '—' : `${(x * 100).toFixed(2)}%`)

  return { apr, apy, displayAPR: fmt(apr), displayAPY: fmt(apy), loading, refresh }
}
