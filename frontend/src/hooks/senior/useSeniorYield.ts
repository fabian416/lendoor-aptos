'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { readPpsScaled, SECONDS_PER_YEAR,  } from '@/lib/utils'
type Options = { pollMs?: number; minSampleSec?: number }

type Result = {
  apr: number | null
  apy: number | null
  displayAPR: string
  displayAPY: string
  source: 'irm' | 'pps' | 'none'
  irmAddress: `0x${string}` | null
  loading: boolean
  refresh: () => Promise<void>
}

/** Format % for UI */
const fmtPct = (x: number | null) => (x == null ? '—' : `${(x * 100).toFixed(2)}%`)

export function useSeniorYield(
  { pollMs = 30_000, minSampleSec = 10 }: Options = {}
): Result {
  const { aptos } = useAptos()

  const [apr, setApr] = React.useState<number | null>(null)
  const [apy, setApy] = React.useState<number | null>(null)
  const [source, setSource] = React.useState<'irm' | 'pps' | 'none'>('none')
  const [loading, setLoading] = React.useState(false)
  const irmAddress = null // no on-chain IRM address in this Move setup

  const prevRef = React.useRef<{ pps: bigint; t: number } | null>(null)

  /** Estimate from PPS delta (realized yield for senior LP) */
  const readFromPpsDelta = React.useCallback(async (): Promise<boolean> => {
    const pps = await readPpsScaled(aptos)
    if (pps == null || pps === 0n) return false

    const now = Math.floor(Date.now() / 1000)
    const prev = prevRef.current
    prevRef.current = { pps, t: now }

    if (!prev || now <= prev.t) return false
    const dt = now - prev.t
    if (dt < minSampleSec) return false
    if (pps === prev.pps) return false

    // ratio = (pps / prevPps) - 1, computed in integer space
    const dScaled = (pps - prev.pps) * 1_000_000_000_000n / prev.pps
    const ratio = Number(dScaled) / 1_000_000_000_000

    const rps = ratio / dt
    const apr_ = rps * SECONDS_PER_YEAR
    const apy_ = Math.expm1(rps * SECONDS_PER_YEAR)

    setApr(apr_)
    setApy(apy_)
    setSource('pps')
    return true
  }, [aptos, minSampleSec])

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      if (await readFromPpsDelta()) return
      setSource('none')
      setApr(null)
      setApy(null)
    } finally {
      setLoading(false)
    }
  }, [readFromPpsDelta])

  React.useEffect(() => {
    void refresh()
    if (!pollMs) return
    const id = setInterval(() => void refresh(), pollMs)
    return () => clearInterval(id)
  }, [refresh, pollMs])

  return {
    apr,
    apy,
    displayAPR: fmtPct(apr),
    displayAPY: fmtPct(apy),
    source,
    irmAddress,
    loading,
    refresh,
  }
}
