'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { LENDOOR_CONTRACT, WUSDC_DECIMALS, WUSDC_TYPE } from '@/lib/constants'
import { decRaw } from '@/lib/utils'

type Options = { pollMs?: number }

/** Try a few common view fns to read junior PPS in Decimal(1e9) scale. */
async function readJuniorPpsScaled(aptos: any): Promise<bigint | null> {
  const candidates = [
    `${LENDOOR_CONTRACT}::junior::pps_scaled`,
    `${LENDOOR_CONTRACT}::junior::pps`,
    `${LENDOOR_CONTRACT}::junior::price_per_share`,
    `${LENDOOR_CONTRACT}::junior::current_exchange_rate`,
  ]
  for (const fn of candidates) {
    try {
      const out = await aptos.view({
        payload: { function: fn, typeArguments: [WUSDC_TYPE], functionArguments: [] },
      })
      const v = out?.[0]
      const scaled = v == null ? 0n : decRaw(v)
      if (scaled > 0n) return scaled
    } catch {
      // try next candidate
    }
  }
  return null
}

/**
 * jUSDC/USDC exchange rate (USDC per 1 jUSDC).
 * Displays "1/<rate>" like the senior hook.
 */
export function useJuniorExchangeRate({ pollMs = 30_000 }: Options = {}) {
  const { aptos } = useAptos()
  const [rate, setRate] = React.useState<number | null>(null) // USDC per 1 jUSDC
  const [loading, setLoading] = React.useState(false)

  const read = React.useCallback(async () => {
    setLoading(true)
    try {
      const ppsScaled = await readJuniorPpsScaled(aptos) // Decimal(1e9)
      if (!ppsScaled) {
        setRate(null)
        return
      }
      // Convert Decimal(1e9) → base units → token units
      const baseUnitsPerShare = Number(ppsScaled) / 1e9
      const tokensPerShare = baseUnitsPerShare / 10 ** WUSDC_DECIMALS
      setRate(Number.isFinite(tokensPerShare) ? tokensPerShare : null)
    } catch {
      setRate(null)
    } finally {
      setLoading(false)
    }
  }, [aptos])

  React.useEffect(() => {
    void read()
    if (!pollMs) return
    const id = setInterval(() => void read(), pollMs)
    return () => clearInterval(id)
  }, [read, pollMs])

  const display =
    rate == null ? '—' : `1/${new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(rate)}`

  return { rate, display, loading, refresh: read }
}
