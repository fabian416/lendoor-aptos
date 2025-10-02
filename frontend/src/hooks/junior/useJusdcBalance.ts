'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { LENDOOR_CONTRACT, WUSDC_TYPE } from '@/lib/constants'
import { formatUSDCAmount2dp } from '@/lib/utils'

/** Try several common view names to read jUSDC (junior LP) balance */
async function readJuniorBalance(
  aptos: any,
  owner: string,
): Promise<bigint | null> {
  const fns = [
    `${LENDOOR_CONTRACT}::junior::balance_of`,
    `${LENDOOR_CONTRACT}::junior::lp_balance_of`,
    `${LENDOOR_CONTRACT}::junior::balance_of_for`,
  ]
  for (const fn of fns) {
    try {
      const out = await aptos.view({
        payload: {
          function: fn,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [owner], // pass as string to satisfy TS
        },
      })
      const v = out?.[0]
      if (v == null) continue
      // Accept u64/u128 returned as string/number/bigint
      if (typeof v === 'bigint') return v
      if (typeof v === 'number') return BigInt(v)
      if (typeof v === 'string') return BigInt(v)
      // Some SDKs may wrap as object
      if (typeof v === 'object' && 'value' in (v as any)) {
        return BigInt((v as any).value)
      }
    } catch {
      // try next candidate
    }
  }
  return null
}

/**
 * Reads the connected wallet's jUSDC (junior LP) balance from Move.
 * Keeps the same return shape as your original hook.
 */
export function useJusdcBalance(pollMs = 10_000) {
  const { aptos } = useAptos()
  const { account } = useWallet()

  const [raw, setRaw] = React.useState<bigint | null>(null)
  const [display, setDisplay] = React.useState<string>('—')
  const [loading, setLoading] = React.useState(false)

  const read = React.useCallback(async () => {
    const addr = account?.address ? String(account.address) : null
    if (!addr) {
      setRaw(null)
      setDisplay('—')
      return
    }
    setLoading(true)
    try {
      const bal = await readJuniorBalance(aptos, addr)
      if (bal == null) {
        setRaw(null)
        setDisplay('—')
        return
      }
      setRaw(bal)
      const pretty = formatUSDCAmount2dp(bal) // j-shares use USDC-like decimals for UI
      setDisplay(prev => (prev === pretty ? prev : pretty))
    } catch {
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
