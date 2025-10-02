'use client'

import * as React from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { useAptos } from '@/providers/WalletProvider'
import { LENDOOR_CONTRACT, WUSDC_TYPE } from '@/lib/constants'
import { formatUSDCAmount2dp } from '@/lib/utils'

/** Build the senior LP coin type: reserve::LP<WUSDC>. */
const LP_TYPE = `${LENDOOR_CONTRACT}::reserve::LP<${WUSDC_TYPE}>` as const

type MaybeAddr = string | { toStringLong?: () => string; toString?: () => string }
const addrToString = (a?: MaybeAddr) =>
  !a ? '' : typeof a === 'string' ? a : a.toStringLong?.() ?? a.toString?.() ?? ''

/**
 * Wallet sUSDC (LP) balance.
 * Strategy:
 * 1) Fast path via indexer: getAccountCoinAmount({ coinType: LP_TYPE }).
 * 2) Ledger fallback: getAccountResource CoinStore<LP_TYPE>.
 * 3) Optional indexer list: getAccountCoinsData() lookup by coin_type === LP_TYPE.
 * Notes:
 * - sUSDC is ALWAYS a COIN (never FA). Do NOT use faMetadataAddress here.
 * - If user deposited using controller::deposit, LP tokens may be in the reserve (collateral),
 *   so the wallet balance can legitimately be zero.
 */
export function useSusdcWalletBalance(pollMs = 15_000) {
  const { aptos } = useAptos()
  const { account } = useWallet()
  const [raw, setRaw] = React.useState<bigint | null>(null)
  const [display, setDisplay] = React.useState<string>('—')
  const [loading, setLoading] = React.useState(false)
  const inFlightRef = React.useRef(false)

  const read = React.useCallback(async () => {
    const addr = addrToString(account?.address)
    if (!addr) { setRaw(null); setDisplay('—'); return }
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)

    try {
      let balance: bigint | null = null

      // 1) Fast indexer path
      try {
        const amt = await aptos.getAccountCoinAmount({
          accountAddress: addr,
          coinType: LP_TYPE,
        })
        balance = typeof amt === 'bigint' ? amt : BigInt(String(amt))
      } catch { /* fallthrough */ }

      // 2) Ledger fallback
      if (balance == null) {
        try {
          const res = await aptos.getAccountResource({
            accountAddress: addr,
            resourceType: `0x1::coin::CoinStore<${LP_TYPE}>`,
          })
          const rawVal = (res as any)?.data?.coin?.value
          balance = rawVal != null ? BigInt(rawVal) : 0n
        } catch (e: any) {
          const msg = String(e?.message ?? e?.status ?? '')
          if (msg.includes('404')) {
            // 3) Optional indexer list
            try {
              const coins = await aptos.getAccountCoinsData({ accountAddress: addr } as any)
              const row = (coins as any[])?.find(c => c?.coin_type === LP_TYPE)
              balance = row ? BigInt(String(row.amount ?? '0')) : 0n
            } catch { balance = 0n }
          } else if (msg.includes('429')) {
            return // rate limited: keep previous UI
          } else {
            return // unknown error: keep previous UI
          }
        }
      }

      if (balance == null) return
      setRaw(balance)
      const pretty = formatUSDCAmount2dp(balance) // LP uses same decimals as underlying
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
