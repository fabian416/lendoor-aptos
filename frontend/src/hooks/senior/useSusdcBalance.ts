'use client'

import * as React from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { useAptos } from '@/providers/WalletProvider'
import { WUSDC_TYPE } from '@/lib/constants'
import { formatUSDCAmount2dp } from '@/lib/utils'

/**
 * Lee el balance del WUSDC del usuario (COIN o FA).
 * Estrategia:
 * - Si WUSDC_TYPE es address "0x..." (sin "::") => FA: getAccountCoinAmount({ faMetadataAddress })
 * - Si WUSDC_TYPE es "0x..::mod::Struct"        => COIN:
 *     1) (rápido) getAccountCoinAmount({ coinType })
 *     2) (ledger) getAccountResource CoinStore<T>  (404 => 0, 429 => conserva UI)
 *     3) (opcional) indexer getAccountCoinsData
 */

type MaybeAddr = string | { toStringLong?: () => string; toString?: () => string }
const addrToString = (a?: MaybeAddr) =>
  !a ? '' : typeof a === 'string' ? a : a.toStringLong?.() ?? a.toString?.() ?? ''

// COIN simple: "0x..::mod::Struct" (sin genéricos)
function isSimpleCoinType(t: string): t is `${string}::${string}::${string}` {
  return !t.includes('<') && !t.includes('>') && t.split('::').length === 3
}

// FA metadata: "0x..." (sin "::")
const isFaMetadata = (t: string) => t.startsWith('0x') && !t.includes('::')

// Para satisfacer el typing del SDK con CoinStore<...>
type StructId = `${string}::${string}::${string}`
const asStructId = (s: string) => s as unknown as StructId

export function useSusdcBalance(pollMs = 15_000) {
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

      if (isFaMetadata(WUSDC_TYPE)) {
        // ========= FA (no hay CoinStore) =========
        try {
          const amt = await aptos.getAccountCoinAmount({
            accountAddress: addr,
            faMetadataAddress: WUSDC_TYPE,
          })
          balance = typeof amt === 'bigint' ? amt : BigInt(String(amt))
        } catch {
          // Si falla el indexer de FA, no hay ledger fallback → no pisar UI
          return
        }
      } else {
        // ========= COIN =========

        // 1) Fast path: coin simple
        if (isSimpleCoinType(WUSDC_TYPE)) {
          try {
            const amt = await aptos.getAccountCoinAmount({
              accountAddress: addr,
              coinType: WUSDC_TYPE,
            })
            balance = typeof amt === 'bigint' ? amt : BigInt(String(amt))
          } catch { /* sigue a CoinStore */ }
        }

        // 2) Ledger: CoinStore<T> (sirve también si WUSDC_TYPE tuviera genéricos)
        if (balance == null) {
          try {
            const res = await aptos.getAccountResource({
              accountAddress: addr,
              resourceType: asStructId(`0x1::coin::CoinStore<${WUSDC_TYPE}>`),
            })
            const rawVal = (res as any)?.data?.coin?.value
            balance = rawVal != null ? BigInt(rawVal) : 0n
          } catch (e: any) {
            const msg = String(e?.message ?? e?.status ?? '')
            if (msg.includes('404')) {
              // 3) Opcional: indexer (puede estar atrasado unos segs)
              try {
                const coins = await aptos.getAccountCoinsData({ accountAddress: addr } as any)
                const row = (coins as any[])?.find(c => c?.coin_type === WUSDC_TYPE)
                balance = row ? BigInt(String(row.amount ?? '0')) : 0n
              } catch { balance = 0n }
            } else if (msg.includes('429')) {
              return // rate limit: conserva UI
            } else {
              return // otro error: no pisar UI
            }
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
