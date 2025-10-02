'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { LENDOOR_CONTRACT, WUSDC_DECIMALS, WUSDC_TYPE } from '@/lib/constants'
import { decRaw, toBigIntLoose, DEC_SCALE } from '@/lib/utils'

type Options = { pollMs?: number }

/** Minimal shape we need from reserve_state */
type ReserveDetailsView = {
  total_lp_supply: string | number | bigint
  total_cash_available: string | number | bigint
  initial_exchange_rate: unknown
  reserve_amount: unknown
  total_borrowed: unknown
}

/** Narrow the first view result into the shape we expect */
function asReserveDetails(v: unknown): ReserveDetailsView | null {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (
      'total_lp_supply' in o &&
      'total_cash_available' in o &&
      'initial_exchange_rate' in o &&
      'reserve_amount' in o &&
      'total_borrowed' in o
    ) {
      return o as ReserveDetailsView
    }
  }
  return null
}

/** Reads PPS (USDC per 1 sUSDC) from reserve state (Decimal 1e9 → tokens). */
async function readSeniorExchangeRate(aptos: any): Promise<number | null> {
  const out = (await aptos.view({
    payload: {
      function: `${LENDOOR_CONTRACT}::reserve::reserve_state`,
      typeArguments: [WUSDC_TYPE],
      functionArguments: [],
    },
  })) as unknown[]

  const state = asReserveDetails(out?.[0])
  if (!state) return null

  const totalLp = toBigIntLoose(state.total_lp_supply) // u128
  const cashU128 = toBigIntLoose(state.total_cash_available) // u128
  const initEx = decRaw(state.initial_exchange_rate) // 1e9
  const reserveA = decRaw(state.reserve_amount) // 1e9
  const borrowed = decRaw(state.total_borrowed) // 1e9

  // If supply is zero, fall back to initial exchange rate.
  const ppsScaled: bigint =
    totalLp === 0n
      ? initEx
      : (() => {
          // TVL (1e9): borrowed + cash - reserve
          const cashScaled = cashU128 * DEC_SCALE
          const tvlScaled = borrowed + cashScaled - reserveA
          if (tvlScaled <= 0n) return 0n
          return tvlScaled / totalLp // still 1e9 scale
        })()

  if (ppsScaled === 0n) return null

  // Convert 1e9 → base units; then divide by token decimals to get tokens.
  const baseUnitsPerShare = Number(ppsScaled) / 1e9
  const rateTokens = baseUnitsPerShare / 10 ** WUSDC_DECIMALS

  return Number.isFinite(rateTokens) ? rateTokens : null
}

/**
 * Senior exchange rate hook (USDC per 1 sUSDC).
 * Same return shape as your EVM version.
 */
export function useSeniorExchangeRate({ pollMs = 30_000 }: Options = {}) {
  const { aptos } = useAptos()
  const [rate, setRate] = React.useState<number | null>(null)
  const [loading, setLoading] = React.useState(false)

  const read = React.useCallback(async () => {
    setLoading(true)
    try {
      const r = await readSeniorExchangeRate(aptos)
      setRate(r)
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
