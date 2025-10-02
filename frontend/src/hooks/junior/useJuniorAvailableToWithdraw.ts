'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { LENDOOR_CONTRACT, WUSDC_DECIMALS, WUSDC_TYPE } from '@/lib/constants'
import { DECIMALS } from '@/lib/utils'

type Options = { pollMs?: number }

/** Reads max withdrawable senior shares from the junior wrapper. */
async function readJuniorMaxWithdrawSShares(
  aptos: any,
  owner: string | { toString: () => string }, // <-- accept AccountAddress-like
): Promise<bigint | null> {
  const ownerStr = typeof owner === 'string' ? owner : owner.toString()

  const fns = [
    `${LENDOOR_CONTRACT}::junior::max_withdraw_senior_shares`,
    `${LENDOOR_CONTRACT}::junior::max_withdraw_s`,
    `${LENDOOR_CONTRACT}::junior::max_withdraw`,
    `${LENDOOR_CONTRACT}::junior::withdrawable_senior_shares`,
    `${LENDOOR_CONTRACT}::junior::available_to_withdraw_s`,
  ]
  for (const fn of fns) {
    try {
      const out = await aptos.view({
        payload: { function: fn, typeArguments: [WUSDC_TYPE], functionArguments: [ownerStr] },
      })
      const v = out?.[0]
      if (v == null) continue
      return typeof v === 'bigint' ? v : BigInt(v as any)
    } catch {
      // try next candidate
    }
  }
  return null
}

/** Base-units → UI units using DECIMALS. */
function toUiFromBase(raw: bigint, onChainDec: number): number | null {
  try {
    const human = Number(raw) / 10 ** onChainDec
    if (!Number.isFinite(human)) return null
    const scale = Math.pow(10, onChainDec - DECIMALS)
    return human * scale
  } catch {
    return null
  }
}

export function useJuniorAvailableToWithdraw({ pollMs = 30_000 }: Options = {}) {
  const { aptos } = useAptos()
  const { account } = useWallet()
  const owner = account?.address // AccountAddress | string

  const [rawSShares, setRawSShares] = React.useState<bigint | null>(null)
  const [sDec, setSDec] = React.useState<number | null>(null)
  const [uiAmount, setUiAmount] = React.useState<number | null>(null)
  const [loading, setLoading] = React.useState(false)

  const read = React.useCallback(async () => {
    if (!owner) {
      setRawSShares(null)
      setSDec(null)
      setUiAmount(null)
      return
    }
    setLoading(true)
    try {
      const sOut = await readJuniorMaxWithdrawSShares(aptos, owner) // <-- pass owner as-is
      if (sOut == null) {
        setRawSShares(null)
        setSDec(null)
        setUiAmount(null)
        return
      }
      setRawSShares(sOut)

      const onChainDec = WUSDC_DECIMALS // sUSDC shares use the wrapped coin decimals
      setSDec(onChainDec)

      setUiAmount(toUiFromBase(sOut, onChainDec))
    } catch {
      setRawSShares(null)
      setSDec(null)
      setUiAmount(null)
    } finally {
      setLoading(false)
    }
  }, [aptos, owner])

  React.useEffect(() => {
    void read()
    if (!pollMs) return
    const id = setInterval(() => void read(), pollMs)
    return () => clearInterval(id)
  }, [read, pollMs])

  const display =
    uiAmount == null
      ? '—'
      : `${new Intl.NumberFormat(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: DECIMALS,
        }).format(uiAmount)} sUSDC`

  return { rawSShares, sDecimals: sDec, uiAmount, display, loading, refresh: read }
}
