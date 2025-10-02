'use client'

import { useSusdcWalletBalance } from '@/hooks/senior/useSusdcWalletBalance'
import { useSusdcCollateral } from '@/hooks/senior/useSusdcCollateral'

/**
 * Combined view: total sUSDC (wallet + collateral).
 */
export function useSusdcBalance(pollMs = 15_000) {
  const w = useSusdcWalletBalance(pollMs)
  const c = useSusdcCollateral(pollMs)

  const totalRaw =
    w.raw == null || c.lpRaw == null ? null : w.raw + c.lpRaw

  const display =
    w.display === '—' && c.lpDisplay === '—'
      ? '—'
      : (() => {
          try {
            // crude join; if you need consistent formatting, reuse your formatter here
            const wNum = w.raw ?? 0n
            const cNum = c.lpRaw ?? 0n
            const total = wNum + cNum
            return new Intl.NumberFormat(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(Number(total) / 1e6) // adjust if your formatter expects 6 decimals
          } catch {
            return '—'
          }
        })()

  const loading = w.loading || c.loading
  const refresh = () => { void w.refresh(); void c.refresh() }

  return { totalRaw, display, loading, refresh, wallet: w, collateral: c }
}
