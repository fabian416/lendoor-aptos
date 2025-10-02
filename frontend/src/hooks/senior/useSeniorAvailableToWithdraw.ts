'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { useSusdcBalance } from '@/hooks/senior/useSusdcBalance' // <- tu hook (wallet + collateral)
import { LENDOOR_CONTRACT, WUSDC_DECIMALS, WUSDC_TYPE } from '@/lib/constants'
import { DEC_SCALE, toBigIntLoose, decRaw } from '@/lib/utils'

type Options = { pollMs?: number }

type Diagnosis =
  | 'ok'
  | 'no-liquidity'              // pool cash = 0
  | 'no-balance'                // user total LP = 0
  | 'controller-or-disabled'    // allow_redeem = false
  | 'unknown'

/** Single view helper with SDK camelCase first, snake_case fallback. */
async function callView<T>(
  aptos: any,
  fn: string,
  typeArgs: string[] = [],
  fnArgs: unknown[] = []
): Promise<T | null> {
  try {
    const out = await aptos.view({ payload: { function: fn, typeArguments: typeArgs, functionArguments: fnArgs } })
    return out as T
  } catch {
    try {
      const out = await aptos.view({ payload: { function: fn, type_arguments: typeArgs, arguments: fnArgs } })
      return out as T
    } catch {
      return null
    }
  }
}

/** Parse only fields we need from reserve_state. */
function parseReserveState(v: unknown) {
  if (!v || typeof v !== 'object') throw new Error('bad reserve_state')
  const o = v as Record<string, any>
  return {
    totalLp: toBigIntLoose(o.total_lp_supply),        // u128
    cashU128: toBigIntLoose(o.total_cash_available),  // u128 (pool cash)
    initEx: decRaw(o.initial_exchange_rate),          // Decimal(1e9)
    reserveAmt: decRaw(o.reserve_amount),             // Decimal(1e9)
    borrowed: decRaw(o.total_borrowed),               // Decimal(1e9)
    cfg: o.reserve_config ?? null,                    // to read withdraw fee and allow_redeem
  }
}

/** Compute PPS in Decimal(1e9): TVL(1e9)/totalLp or initial if supply == 0. */
function computePpsScaled(st: ReturnType<typeof parseReserveState>): bigint {
  if (st.totalLp === 0n) return st.initEx
  const cashScaled = st.cashU128 * DEC_SCALE
  const tvlScaled = st.borrowed + cashScaled - st.reserveAmt
  if (tvlScaled <= 0n) return 0n
  return tvlScaled / st.totalLp // still Decimal(1e9)
}

/** Convert base units -> UI number using token decimals. */
function toUi(raw: bigint, tokenDecimals: number): number | null {
  const n = Number(raw) / 10 ** tokenDecimals
  return Number.isFinite(n) ? n : null
}

/**
 * Max senior withdrawable (USDC) for current user.
 *
 * Definition:
 *   available = min( totalUserLP * PPS, poolCash ) - withdrawFee
 *
 * Where:
 *   - totalUserLP comes from your `useSusdcBalance` (wallet + collateral).
 *   - PPS is computed from reserve_state in Decimal(1e9) to avoid precision loss.
 *   - poolCash and withdraw fee are read from reserve_state (cfg).
 *
 * Notes:
 *   - If the user has debt in WUSDC, the *real* available may be less due to credit/health.
 *     Este cálculo asume que retirar desde colateral es posible (caso usual sin deuda).
 *   - If cfg.allow_redeem = false, returns 0 with diagnosis 'controller-or-disabled'.
 */
export function useSeniorAvailableToWithdraw({ pollMs = 30_000 }: Options = {}) {
  const { aptos } = useAptos()
  const susdc = useSusdcBalance(pollMs) // <- tu hook ya suma wallet + collateral

  const [rawUSDC, setRawUSDC] = React.useState<bigint | null>(null)
  const [uiAmount, setUiAmount] = React.useState<number | null>(null)
  const [diagnosis, setDiagnosis] = React.useState<Diagnosis>('unknown')
  const [loading, setLoading] = React.useState(false)

  const read = React.useCallback(async () => {
    // total LP owned by user (wallet + collateral)
    const totalLP = susdc.totalRaw ?? 0n
    if (totalLP === 0n) {
      setRawUSDC(0n); setUiAmount(0); setDiagnosis('no-balance')
      return
    }

    setLoading(true)
    try {
      // 1) Snapshot reserve_state (single source of truth)
      const out = await callView<unknown[]>(
        aptos,
        `${LENDOOR_CONTRACT}::reserve::reserve_state`,
        [WUSDC_TYPE],
        []
      )
      if (!out) throw new Error('reserve_state view failed')
      const st = parseReserveState(out[0])

      // 2) Respect allow_redeem if present (default allow=true)
      const allowRedeem =
        st.cfg && typeof st.cfg.allow_redeem === 'boolean' ? Boolean(st.cfg.allow_redeem) : true
      if (!allowRedeem) {
        setRawUSDC(0n); setUiAmount(0); setDiagnosis('controller-or-disabled')
        return
      }

      // 3) PPS (Decimal 1e9) and pool cash
      const ppsScaled = computePpsScaled(st)
      if (ppsScaled === 0n) {
        setRawUSDC(0n); setUiAmount(0); setDiagnosis('unknown')
        return
      }
      const poolCash = st.cashU128

      // LP -> underlying (base units), then cap by liquidity
      const userUnderlying = (totalLP * ppsScaled) / DEC_SCALE
      const soft = userUnderlying < poolCash ? userUnderlying : poolCash
      if (soft === 0n) {
        setRawUSDC(0n); setUiAmount(0); setDiagnosis(poolCash === 0n ? 'no-liquidity' : 'no-balance')
        return
      }

      // 4) Withdraw fee (hundredth bips -> millionths)
      let feeMillionth = 0n
      if (st.cfg && 'withdraw_fee_hundredth_bips' in st.cfg) {
        const raw = (st.cfg as any).withdraw_fee_hundredth_bips
        feeMillionth = typeof raw === 'object' && raw != null && 'value' in raw
          ? toBigIntLoose((raw as any).value)
          : toBigIntLoose(raw)
      }
      const deliver = soft - (soft * feeMillionth) / 1_000_000n

      setRawUSDC(deliver)
      setUiAmount(toUi(deliver, WUSDC_DECIMALS))
      setDiagnosis(deliver > 0n ? 'ok' : (poolCash === 0n ? 'no-liquidity' : 'unknown'))
    } catch {
      setRawUSDC(0n); setUiAmount(0); setDiagnosis('unknown')
    } finally {
      setLoading(false)
    }
  }, [aptos, susdc.totalRaw])

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
          maximumFractionDigits: 6,
        }).format(uiAmount)} USDC`

  return { rawUSDC, uiAmount, display, loading, diagnosis, refresh: read }
}
