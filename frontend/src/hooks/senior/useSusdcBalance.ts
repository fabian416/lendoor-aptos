'use client'

import * as React from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { useAptos } from '@/providers/WalletProvider'
import { WUSDC_TYPE } from '@/lib/constants'
import { formatUSDCAmount2dp } from '@/lib/utils'

/**
 * Reads connected wallet's WUSDC coin balance (Move coin).
 * Strategy:
 * 1) aptos.getAccountCoinAmount (fast path)
 * 2) fallback: read CoinStore<...> resource
 *  - 404 => treat as 0
 *  - 429 => keep previous (don't thrash UI)
 */
export function useSusdcBalance(pollMs = 15_000) {
  const { aptos } = useAptos()
  const { account } = useWallet()

  const [raw, setRaw] = React.useState<bigint | null>(null)
  const [display, setDisplay] = React.useState<string>('—')
  const [loading, setLoading] = React.useState(false)

  // Prevent overlapping requests (helps with rate limits)
  const inFlightRef = React.useRef(false)

  const read = React.useCallback(async () => {
    const addr = account?.address
    if (!addr) {
      setRaw(null)
      setDisplay('—')
      return
    }
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)

    try {
      let balance: bigint | null = null

      // -------- try #1: getAccountCoinAmount (coin API) --------
      try {
        const amt = await aptos.getAccountCoinAmount({
          accountAddress: addr,
          coinType: WUSDC_TYPE,
        })
        balance = typeof amt === 'bigint' ? amt : BigInt(amt as unknown as string)
      } catch (e: any) {
        // fallthrough → try #2
      }

      // -------- try #2: read CoinStore<...> directly --------
      if (balance == null) {
        const storeType = `0x1::coin::CoinStore<${WUSDC_TYPE}>` as const
        try {
          const res = await aptos.getAccountResource({
            accountAddress: addr,
            resourceType: storeType,
          })
          const rawVal = (res as any)?.data?.coin?.value
          balance = rawVal != null ? BigInt(rawVal) : 0n
        } catch (e: any) {
          const msg = String(e?.message ?? e?.status ?? '')
          if (msg.includes('404')) {
            // No CoinStore yet => 0 balance
            balance = 0n
          } else if (msg.includes('429')) {
            // Rate limited: keep previous UI, don't flip to "—"
            return
          } else {
            // Unknown error: keep previous (don't nuke UI)
            return
          }
        }
      }

      if (balance == null) return

      setRaw(balance)
      const pretty = formatUSDCAmount2dp(balance)
      setDisplay(prev => (prev === pretty ? prev : pretty))
    } finally {
      setLoading(false)
      inFlightRef.current = false
    }
  }, [aptos, account?.address])

  React.useEffect(() => {
    void read()
    if (!pollMs) return
    const id = setInterval(() => void read(), pollMs)
    return () => clearInterval(id)
  }, [read, pollMs])

  return { raw, display, loading, refresh: read }
}
