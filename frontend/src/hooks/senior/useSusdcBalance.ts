'use client'

import * as React from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { useAptos } from '@/providers/WalletProvider'
import { WUSDC_TYPE } from '@/lib/constants'
import { formatUSDCAmount2dp } from '@/lib/utils'

/**
 * Reads the connected wallet's WUSDC coin balance from Move storage.
 * Keeps the same return shape as the original hook.
 */
export function useSusdcBalance(pollMs = 10_000) {
  const { aptos } = useAptos()
  const { account } = useWallet()

  const [raw, setRaw] = React.useState<bigint | null>(null)
  const [display, setDisplay] = React.useState<string>('—')
  const [loading, setLoading] = React.useState(false)

  const read = React.useCallback(async () => {
    const addr = account?.address
    if (!addr) {
      setRaw(null)
      setDisplay('—')
      return
    }
    setLoading(true)
    try {
      // Prefer the SDK coin balance API (efficient and reliable for Move coins)
      const amt = await aptos.getAccountCoinAmount({
        accountAddress: addr,
        coinType: WUSDC_TYPE,
      })
      const asBig = typeof amt === 'bigint' ? amt : BigInt(amt as unknown as string)
      setRaw(asBig)

      // Format for UI (2 decimals display for USDC-style tokens)
      const pretty = formatUSDCAmount2dp(asBig)
      setDisplay(prev => (prev === pretty ? prev : pretty))
    } catch {
      // Fallback: reset on any error (e.g., network hiccups)
      setRaw(null)
      setDisplay('—')
    } finally {
      setLoading(false)
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
