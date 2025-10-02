'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { JUSDC_TYPE } from '@/lib/constants'
import { formatUSDCAmount2dp } from '@/lib/utils'
import { shouldSkip, onSuccess, onError } from '@/lib/backoff'

/** Best-effort coin amount:
 *  1) Try getAccountCoinAmount.
 *  2) If it fails, try reading CoinStore directly and parse value.
 *  3) If CoinStore doesn't exist -> return 0n (not an error).
 */
async function safeGetCoinAmount(
  aptos: any,
  addr: string,
  coinType: string
): Promise<bigint> {
  // 1) Primary path
  try {
    const amt = await aptos.getAccountCoinAmount({ accountAddress: addr, coinType })
    return typeof amt === 'bigint' ? amt : BigInt(amt as any)
  } catch (primaryErr: any) {
    // 2) Fallback: read CoinStore
    try {
      const res = await aptos.getAccountResource({
        accountAddress: addr,
        resourceType: `0x1::coin::CoinStore<${coinType}>`,
      })
      // Parse common shapes from different SDKs
      const data: any = (res as any)?.data ?? res
      const raw =
        data?.coin?.value ??
        data?.coin?.value?.value ?? // some SDKs double-wrap
        data?.value
      if (raw == null) {
        // If the resource exists but we cannot parse, bubble original error.
        throw primaryErr
      }
      return typeof raw === 'bigint' ? raw : BigInt(raw as any)
    } catch (fallbackErr: any) {
      // 3) If CoinStore does not exist -> treat as 0
      const code = fallbackErr?.status ?? fallbackErr?.statusCode ?? fallbackErr?.status_code
      const msg = String(fallbackErr?.message ?? '').toLowerCase()
      const notFound = code === 404 || code === '404' || /not\s*found|does not exist|resource/i.test(msg)
      if (notFound) return 0n
      // Unknown failure
      throw primaryErr
    }
  }
}

export function useJusdcBalance(pollMs = 10_000) {
  const { aptos } = useAptos()
  const { account } = useWallet()

  const [raw, setRaw] = React.useState<bigint | null>(null)   // last good value; null = never loaded
  const [display, setDisplay] = React.useState('—')           // UI string based on last good value
  const [loading, setLoading] = React.useState(false)
  const [stale, setStale] = React.useState(false)             // true when last attempt failed but value is cached

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const runningRef = React.useRef(false)
  const mountedRef = React.useRef(true)

  const addr = account?.address ? String(account.address) : null
  const key = React.useMemo(
    () => `balance:${addr ?? 'unknown'}:${JUSDC_TYPE}`,
    [addr]
  )

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const read = React.useCallback(async () => {
    if (!addr) {
      // No connected account: reset visual state
      setRaw(null)
      setDisplay('—')
      setStale(false)
      return
    }
    if (runningRef.current) return
    if (shouldSkip(key)) { // global backoff helper
      // Short delay to re-check later
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => void read(), 5_000)
      return
    }

    runningRef.current = true
    setLoading(true)
    try {
      const amt = await safeGetCoinAmount(aptos, addr, JUSDC_TYPE)
      if (!mountedRef.current) return

      setRaw(amt)
      const pretty = formatUSDCAmount2dp(amt)
      setDisplay(prev => (prev === pretty ? prev : pretty))
      setStale(false)

      // Normal polling cadence after success
      const next = onSuccess(key, pollMs)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => void read(), next)
    } catch (e) {
      if (!mountedRef.current) return
      setStale(true)
      // Keep last good display; only show '—' if we never had a value
      if (raw == null) setDisplay('—')

      // Error backoff cadence
      const next = onError(key, e)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => void read(), next)
    } finally {
      if (mountedRef.current) setLoading(false)
      runningRef.current = false
    }
  }, [aptos, addr, key, pollMs, raw])

  // IMPORTANT: schedule must depend on `read` to avoid stale closure.
  const schedule = React.useCallback((ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void read(), ms)
  }, [read])

  // Kick off and cleanup
  React.useEffect(() => {
    mountedRef.current = true
    void read()
    return () => {
      mountedRef.current = false
      clearTimer()
    }
  }, [read, clearTimer])

  // Reset when account changes
  React.useEffect(() => {
    clearTimer()
    setLoading(true)
    setStale(false)
    setRaw(null)
    setDisplay('—')
    schedule(0) // run immediately with the new account
  }, [addr, clearTimer, schedule])

  return { raw, display, loading, stale, refresh: read }
}
