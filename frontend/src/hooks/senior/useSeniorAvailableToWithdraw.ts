'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { LENDOOR_CONTRACT, WUSDC_DECIMALS, WUSDC_TYPE } from '@/lib/constants'
import { DECIMALS, toBigIntLoose, decRaw } from '@/lib/utils'

type Options = { pollMs?: number }

type Diagnosis =
  | 'ok'
  | 'no-liquidity'
  | 'no-balance'
  | 'controller-or-disabled'
  | 'unknown'
  

/** Parse reserve_state payload into the minimal fields we need. */
function parseReserveState(v: unknown) {
  if (!v || typeof v !== 'object') throw new Error('Bad state')
  const o = v as Record<string, any>
  return {
    totalLp: toBigIntLoose(o.total_lp_supply),
    cashU128: toBigIntLoose(o.total_cash_available),
    initEx: decRaw(o.initial_exchange_rate),
    reserveAmt: decRaw(o.reserve_amount),
    borrowed: decRaw(o.total_borrowed),
    cfg: o.reserve_config ?? {},
  }
}

/** Parse profile_deposit tuple (u64 lp, u64 underlying). */
function parseProfileDeposit(v: unknown): { lp: bigint; underlying: bigint } {
  if (Array.isArray(v) && v.length >= 2) {
    return { lp: toBigIntLoose(v[0]), underlying: toBigIntLoose(v[1]) }
  }
  // Some SDKs may wrap as object with numeric keys
  if (v && typeof v === 'object') {
    const o = v as any
    if (0 in o && 1 in o) return { lp: toBigIntLoose(o[0]), underlying: toBigIntLoose(o[1]) }
  }
  throw new Error('Unexpected profile_deposit shape')
}


/** Scale raw on-chain USDC units to UI units using DECIMALS. */
function toUi(raw: bigint, tokenDecimals: number): number | null {
  try {
    const human = Number(raw) / 10 ** tokenDecimals
    if (!Number.isFinite(human)) return null
    const scale = Math.pow(10, tokenDecimals - DECIMALS)
    return human * scale
  } catch {
    return null
  }
}

/**
 * Move adaptation of “available to withdraw” for senior (LP collateral → underlying).
 * Returns a soft cap: min(user-underlying, pool-cash), minus withdraw fee if configured.
 */
export function useSeniorAvailableToWithdraw({ pollMs = 30_000 }: Options = {}) {
  const { aptos } = useAptos()
  const { account } = useWallet()
  const connectedAddress = account?.address

  const dec = WUSDC_DECIMALS

  const [rawUSDC, setRawUSDC] = React.useState<bigint | null>(null)
  const [uiAmount, setUiAmount] = React.useState<number | null>(null)
  const [diagnosis, setDiagnosis] = React.useState<Diagnosis>('unknown')
  const [loading, setLoading] = React.useState(false)

  const read = React.useCallback(async () => {
    if (!connectedAddress) return
    setLoading(true)
    try {
      // 1) User position
      const depOut = (await aptos.view({
        payload: {
          function: `${LENDOOR_CONTRACT}::profile::profile_deposit`,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [connectedAddress],
        },
      })) as unknown[]
      const deposit = parseProfileDeposit(depOut?.[0])

      if (deposit.lp === 0n || deposit.underlying === 0n) {
        setRawUSDC(0n)
        setUiAmount(0)
        setDiagnosis('no-balance')
        return
      }

      // 2) Reserve state (cash, config)
      const stateOut = (await aptos.view({
        payload: {
          function: `${LENDOOR_CONTRACT}::reserve::reserve_state`,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [],
        },
      })) as unknown[]
      const st = parseReserveState(stateOut?.[0])

      const allowRedeem =
        !!(st.cfg?.allow_redeem ?? st.cfg?.['allow_redeem'])
      if (!allowRedeem) {
        setRawUSDC(0n)
        setUiAmount(0)
        setDiagnosis('controller-or-disabled')
        return
      }

      // 3) Soft cap by liquidity: min(userUnderlying, cash)
      const cash = st.cashU128 // u128 in base units
      const userAssets = deposit.underlying // u64 in base units
      const soft = userAssets < cash ? userAssets : BigInt(cash)

      // 4) Apply withdraw fee if any (stored in "hundredth bips" → millionths)
      const feeMillionthRaw = st.cfg?.withdraw_fee_hundredth_bips ?? 0
      const feeMillionth = typeof feeMillionthRaw === 'object'
        ? toBigIntLoose((feeMillionthRaw as any).value ?? 0)
        : toBigIntLoose(feeMillionthRaw)
      const deliver =
        soft - (soft * feeMillionth) / 1_000_000n

      setRawUSDC(deliver)
      setUiAmount(toUi(deliver, dec))
      if (st.cashU128 === 0n) setDiagnosis('no-liquidity')
      else if (deliver > 0n) setDiagnosis('ok')
      else setDiagnosis('unknown')
    } catch {
      setRawUSDC(0n)
      setUiAmount(0)
      setDiagnosis('unknown')
    } finally {
      setLoading(false)
    }
  }, [aptos, connectedAddress, dec])

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
        }).format(uiAmount)} USDC`

  return { rawUSDC, uiAmount, decimals: dec, display, loading, refresh: read, diagnosis }
}
