'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { LENDOOR_CONTRACT, WUSDC_DECIMALS, WUSDC_TYPE } from '@/lib/constants'
import { DECIMALS, toBigIntLoose, decRaw, DEC_SCALE } from '@/lib/utils'

type Options = { pollMs?: number }

type Diagnosis =
  | 'ok'
  | 'no-liquidity'
  | 'no-balance'
  | 'controller-or-disabled'
  | 'unknown'

/** Senior LP coin type used in coin::balance. */
const SENIOR_LP_TYPE = `${LENDOOR_CONTRACT}::reserve::LPCoin<${WUSDC_TYPE}>`

/** Single place to call aptos.view with the right payload keys (snake_case). */
async function view<T>(
  aptos: any,
  func: string,
  typeArgs: string[] = [],
  args: unknown[] = []
): Promise<T | null> {
  try {
    // Aptos REST /v1/view expects snake_case keys: type_arguments & arguments
    const out = await aptos.view({
      payload: {
        function: func,
        type_arguments: typeArgs,
        arguments: args,
      },
    })
    return out as T
  } catch {
    return null
  }
}

/** Minimal reserve_state we need to compute PPS and read config/cash. */
function parseReserveState(v: unknown) {
  if (!v || typeof v !== 'object') throw new Error('bad reserve_state')
  const o = v as Record<string, any>
  return {
    totalLp: toBigIntLoose(o.total_lp_supply),        // u128
    cashU128: toBigIntLoose(o.total_cash_available),  // u128
    initEx: decRaw(o.initial_exchange_rate),          // Decimal(1e9)
    reserveAmt: decRaw(o.reserve_amount),             // Decimal(1e9)
    borrowed: decRaw(o.total_borrowed),               // Decimal(1e9)
    cfg: o.reserve_config ?? null,
  }
}

/** Compute PPS in Decimal(1e9): tvl(1e9)/totalLp or initial if empty. */
function computePpsScaled(st: ReturnType<typeof parseReserveState>): bigint {
  if (st.totalLp === 0n) return st.initEx
  const cashScaled = st.cashU128 * DEC_SCALE
  const tvlScaled = st.borrowed + cashScaled - st.reserveAmt
  if (tvlScaled <= 0n) return 0n
  return tvlScaled / st.totalLp // still 1e9
}

/** Scale raw base units -> UI number with token decimals. */
function toUi(raw: bigint, tokenDecimals: number): number | null {
  try {
    const n = Number(raw) / 10 ** tokenDecimals
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/**
 * Senior "available to withdraw" (in underlying USDC) for the connected wallet.
 * Soft cap = min(userUnderlying, poolCash), minus withdraw fee (if any).
 * Avoids profile::profile_deposit to prevent 400s when profile doesn't exist.
 * Uses snake_case payload to stop 400 from bad request payload shapes.
 */
export function useSeniorAvailableToWithdraw({ pollMs = 30_000 }: Options = {}) {
  const { aptos } = useAptos()
  const { account } = useWallet()
  const addr = account?.address ? String(account.address) : null

  const tokenDecimals = WUSDC_DECIMALS

  const [rawUSDC, setRawUSDC] = React.useState<bigint | null>(null)
  const [uiAmount, setUiAmount] = React.useState<number | null>(null)
  const [diagnosis, setDiagnosis] = React.useState<Diagnosis>('unknown')
  const [loading, setLoading] = React.useState(false)

  // Prevent double-run in React 18 StrictMode (dev).
  const didInitRef = React.useRef(false)

  const read = React.useCallback(async () => {
    if (!addr) {
      setRawUSDC(null)
      setUiAmount(null)
      setDiagnosis('unknown')
      return
    }

    setLoading(true)
    try {
      // 1) Reserve state (should be a #[view] in your module).
      const stateOut = await view<unknown[]>(aptos, `${LENDOOR_CONTRACT}::reserve::reserve_state`, [WUSDC_TYPE], [])
      if (!stateOut) throw new Error('reserve_state view failed')
      const st = parseReserveState(stateOut[0])

      const allowRedeem =
        st.cfg && typeof st.cfg.allow_redeem === 'boolean' ? Boolean(st.cfg.allow_redeem) : true
      if (!allowRedeem) {
        setRawUSDC(0n)
        setUiAmount(0)
        setDiagnosis('controller-or-disabled')
        return
      }

      // 2) Check if LP is registered and then read LP balance (both are non-aborting views).
      const regOut = await view<unknown[]>(aptos, '0x1::coin::is_account_registered', [SENIOR_LP_TYPE], [addr])
      const isReg = Array.isArray(regOut) ? Boolean(regOut[0]) : false
      if (!isReg) {
        setRawUSDC(0n)
        setUiAmount(0)
        setDiagnosis('no-balance')
        return
      }

      const balOut = await view<unknown[]>(aptos, '0x1::coin::balance', [SENIOR_LP_TYPE], [addr])
      if (!balOut) throw new Error('coin::balance view failed')
      const lp = toBigIntLoose(balOut[0]) // u64

      if (lp === 0n) {
        setRawUSDC(0n)
        setUiAmount(0)
        setDiagnosis('no-balance')
        return
      }

      // 3) Convert LP -> underlying using PPS; soft cap by pool cash.
      const ppsScaled = computePpsScaled(st) // 1e9
      if (ppsScaled === 0n) {
        setRawUSDC(0n)
        setUiAmount(0)
        setDiagnosis('unknown')
        return
      }

      const userUnderlying = (lp * ppsScaled) / DEC_SCALE // base units
      const poolCash = st.cashU128 // base units
      const soft = userUnderlying < poolCash ? userUnderlying : poolCash

      if (soft === 0n) {
        setRawUSDC(0n)
        setUiAmount(0)
        setDiagnosis(poolCash === 0n ? 'no-liquidity' : 'no-balance')
        return
      }

      // 4) Withdraw fee (hundredth bips => millionths), if configured.
      let feeMillionth = 0n
      if (st.cfg && 'withdraw_fee_hundredth_bips' in st.cfg) {
        const raw = (st.cfg as any).withdraw_fee_hundredth_bips
        feeMillionth = typeof raw === 'object' && raw != null && 'value' in raw
          ? toBigIntLoose((raw as any).value)
          : toBigIntLoose(raw)
      }
      const deliver = soft - (soft * feeMillionth) / 1_000_000n

      setRawUSDC(deliver)
      setUiAmount(toUi(deliver, tokenDecimals))
      setDiagnosis(deliver > 0n ? 'ok' : (poolCash === 0n ? 'no-liquidity' : 'unknown'))
    } catch {
      // Swallow errors; UI stays stable and we avoid noisy logs.
      setRawUSDC(0n)
      setUiAmount(0)
      setDiagnosis('unknown')
    } finally {
      setLoading(false)
    }
  }, [aptos, addr, tokenDecimals])

  // One interval only (even under StrictMode).
  React.useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true
      void read()
      if (pollMs) {
        const id = setInterval(() => void read(), pollMs)
        return () => clearInterval(id)
      }
    }
  }, [read, pollMs])

  const display =
    uiAmount == null
      ? '—'
      : `${new Intl.NumberFormat(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: DECIMALS,
        }).format(uiAmount)} USDC`

  return { rawUSDC, uiAmount, decimals: tokenDecimals, display, loading, refresh: read, diagnosis }
}
