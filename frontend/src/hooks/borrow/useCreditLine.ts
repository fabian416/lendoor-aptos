'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { LENDOOR_CONTRACT, WUSDC_DECIMALS, WUSDC_TYPE } from '@/lib/constants'
import { decRaw, toBigIntLoose } from '@/lib/utils'
import type { FQName } from '@/types/aptos'

type Options = { pollMs?: number }

/** Integer formatting: cut decimals, add thousands separators. */
function formatUnits0(amount: bigint, decimals = 6): string {
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Try a list of view fns until one succeeds; returns bigint or null. */
async function tryViewsForBigint(
  aptos: any,
  fns: readonly FQName[],
  args: any[],
  typeArgMode: 'withCoin' | 'noCoin' | 'both' = 'both',
): Promise<bigint | null> {
  const runOne = async (fn: FQName, typeArguments: string[]) => {
    const out = await aptos.view({
      payload: { function: fn, typeArguments, functionArguments: args },
    })
    const v = out?.[0]
    if (v == null) return null
    // Handle u64/u128 and Decimal-like structs
    try {
      if (typeof v === 'object' && !Array.isArray(v)) return decRaw(v)
      return toBigIntLoose(v)
    } catch {
      return null
    }
  }

  for (const fn of fns) {
    try {
      if (typeArgMode === 'withCoin' || typeArgMode === 'both') {
        const val = await runOne(fn, [WUSDC_TYPE])
        if (val != null) return val
      }
      if (typeArgMode === 'noCoin' || typeArgMode === 'both') {
        const val = await runOne(fn, [])
        if (val != null) return val
      }
    } catch { /* keep trying */ }
  }
  return null
}

export function useCreditLine({ pollMs = 15_000 }: Options = {}) {
  const { aptos } = useAptos()
  const { account } = useWallet()
  const owner = account?.address?.toString() // normalize to string

  // Same outward API as your EVM hook
  const [clmAddress, setClmAddress] = React.useState<string | null>(null)

  const [scoreRaw, setScoreRaw] = React.useState<number | null>(null)
  const [scoreDisplay, setScoreDisplay] = React.useState<string>('—')

  const [limitRaw, setLimitRaw] = React.useState<bigint | null>(null)
  const [borrowedRaw, setBorrowedRaw] = React.useState<bigint | null>(null)

  const [limitDisplay, setLimitDisplay] = React.useState<string>('—/—')
  const [borrowedDisplay, setBorrowedDisplay] = React.useState<string>('—')

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Optional: discover a “manager” address if your Move modules expose one
  const discoverManager = React.useCallback(async () => {
    const candidates: readonly FQName[] = [
      `${LENDOOR_CONTRACT}::risk_manager::manager_address` as FQName,
      `${LENDOOR_CONTRACT}::credit_limit_manager::address_of` as FQName,
      `${LENDOOR_CONTRACT}::controller_config::manager_address` as FQName,
    ]
    for (const fn of candidates) {
      try {
        const out = await aptos.view({
          payload: { function: fn, typeArguments: [], functionArguments: [] },
        })
        const v = out?.[0]
        if (typeof v === 'string' && v.startsWith('0x')) {
          setClmAddress(v)
          return
        }
      } catch { /* keep trying */ }
    }
    setClmAddress(null)
  }, [aptos])

  const read = React.useCallback(async () => {
    if (!owner) {
      setScoreRaw(null)
      setScoreDisplay('—')
      setLimitRaw(null)
      setBorrowedRaw(null)
      setBorrowedDisplay('—')
      setLimitDisplay('—/—')
      return
    }
    setLoading(true)
    setError(null)
    try {
      // 1) Score (u8) — try common names
      const scoreFns: readonly FQName[] = [
        `${LENDOOR_CONTRACT}::credit_limit_manager::score_of` as FQName,
        `${LENDOOR_CONTRACT}::risk::score_of` as FQName,
        `${LENDOOR_CONTRACT}::risk_manager::score_of` as FQName,
        `${LENDOOR_CONTRACT}::controller::score_of` as FQName,
      ]
      let score: number | null = null
      for (const fn of scoreFns) {
        try {
          const out = await aptos.view({
            payload: { function: fn, typeArguments: [], functionArguments: [owner] },
          })
          const v = out?.[0]
          if (v != null) {
            const s = Number(v)
            if (Number.isFinite(s)) {
              score = s
              break
            }
          }
        } catch { /* keep trying */ }
      }
      setScoreRaw(score)
      setScoreDisplay(score == null ? '—' : `${score}/255`)

      // 2) Credit limit (asset base units)
      const limit = await tryViewsForBigint(
        aptos,
        [
          `${LENDOOR_CONTRACT}::credit_limit_manager::credit_limit_of` as FQName,
          `${LENDOOR_CONTRACT}::credit_limit_manager::credit_limit` as FQName,
          `${LENDOOR_CONTRACT}::risk_manager::credit_limit_of` as FQName,
          `${LENDOOR_CONTRACT}::controller::credit_limit_of` as FQName,
        ],
        [owner],
        'both',
      )
      setLimitRaw(limit)

      // 3) Borrowed amount by user (asset base units)
      const borrowed = await tryViewsForBigint(
        aptos,
        [
          `${LENDOOR_CONTRACT}::reserve::debt_of` as FQName,
          `${LENDOOR_CONTRACT}::controller::debt_of` as FQName,
          `${LENDOOR_CONTRACT}::profile::profile_debt` as FQName,
          `${LENDOOR_CONTRACT}::profile::borrow_of` as FQName,
        ],
        [owner],
        'withCoin',
      )
      setBorrowedRaw(borrowed)

      // 4) Displays (truncate decimals; USDC-like by default)
      const dBorrowed = borrowed == null ? '—' : formatUnits0(borrowed, WUSDC_DECIMALS)
      const dLimit = limit == null ? '—' : formatUnits0(limit, WUSDC_DECIMALS)

      setBorrowedDisplay(prev => (prev === dBorrowed ? prev : dBorrowed))
      const pair = `${dBorrowed}/${dLimit} USDC`
      setLimitDisplay(prev => (prev === pair ? prev : pair))
    } catch (e: any) {
      setError(e?.shortMessage || e?.reason || e?.message || 'read failed')
      setScoreRaw(null)
      setScoreDisplay('—')
      setLimitRaw(null)
      setBorrowedRaw(null)
      setBorrowedDisplay('—')
      setLimitDisplay('—/—')
    } finally {
      setLoading(false)
    }
  }, [aptos, owner])

  React.useEffect(() => { void discoverManager() }, [discoverManager])
  React.useEffect(() => { void read() }, [read])

  React.useEffect(() => {
    if (!pollMs || pollMs <= 0) return
    const id = setInterval(() => void read(), pollMs)
    return () => clearInterval(id)
  }, [pollMs, read])

  return {
    clmAddress,
    scoreRaw,
    scoreDisplay,
    limitRaw,
    borrowedRaw,
    borrowedDisplay,
    limitDisplay,
    loading,
    error,
    refresh: read,
  }
}
