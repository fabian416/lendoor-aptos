'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { LENDOOR_CONTRACT, WUSDC_TYPE } from '@/lib/constants'
import { decRaw, DEC_SCALE } from '@/lib/utils'

type Options = { pollMs?: number }

const ONE = 1

/**
 * Reads junior PPS as **sUSDC per 1 jUSDC**, scaled by 1e9 (Decimal scale).
 * This uses `lendoor::junior::pps_scaled<Coin0>()`, which your contract already exposes.
 *
 * Important:
 * - Do NOT mix this with `reserve_state` math here; `pps_scaled` is already LP/share.
 * - Keep it pure to avoid semantic mismatches with “underlying per LP”.
 */
async function readJuniorSusdcPerJusdcScaled(aptos: any): Promise<bigint | null> {
  try {
    const out = await aptos.view({
      payload: {
        function: `${LENDOOR_CONTRACT}::junior::pps_scaled`,
        typeArguments: [WUSDC_TYPE],
        functionArguments: [],
      },
    })
    const v = out?.[0]
    const scaled = v == null ? 0n : decRaw(v) // LP/share in Decimal(1e9)
    return scaled > 0n ? scaled : null
  } catch {
    // Strict on semantics: we do not fall back to differently-defined functions.
    return null
  }
}

/**
 * Hook: sUSDC per 1 jUSDC (LP/share).
 * Also provides the reciprocal (jUSDC per 1 sUSDC) for UIs that prefer “1/<rate>”.
 */
export function useJuniorExchangeRate({ pollMs = 30_000 }: Options = {}) {
  const { aptos } = useAptos()
  const [susdcPerJusdc, setSusdcPerJusdc] = React.useState<number | null>(null) // sUSDC per 1 jUSDC
  const [jusdcPerSusdc, setJusdcPerSusdc] = React.useState<number | null>(null) // 1 / sUSDC_per_jUSDC
  const [loading, setLoading] = React.useState(false)

  const read = React.useCallback(async () => {
    setLoading(true)
    try {
      const ppsScaled = await readJuniorSusdcPerJusdcScaled(aptos) // Decimal(1e9), LP/share
      if (!ppsScaled) {
        setSusdcPerJusdc(null)
        setJusdcPerSusdc(null)
        return
      }

      // Convert Decimal(1e9) to a JS number.
      const sPerJ = Number(ppsScaled) / Number(DEC_SCALE) // sUSDC per 1 jUSDC
      const jPerS =
        Number.isFinite(sPerJ) && sPerJ > 0 ? ONE / sPerJ : null // jUSDC per 1 sUSDC (reciprocal)

      setSusdcPerJusdc(Number.isFinite(sPerJ) ? sPerJ : null)
      setJusdcPerSusdc(jPerS)
    } catch {
      setSusdcPerJusdc(null)
      setJusdcPerSusdc(null)
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

  // If you want to mirror your senior “1/<rate>” format:
  // - For junior, that “1/<rate>” would typically mean **jUSDC per 1 sUSDC** (the reciprocal).
  const display =
    jusdcPerSusdc == null
      ? '—'
      : `1/${new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(susdcPerJusdc!)}`

  // Alternative explicit labels (pick what fits your UI):
  const displaySusdcPerJusdc =
    susdcPerJusdc == null ? '—' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(susdcPerJusdc)} sUSDC`
  const displayJusdcPerSusdc =
    jusdcPerSusdc == null ? '—' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(jusdcPerSusdc)} jUSDC`

  return {
    // raw values
    susdcPerJusdc,   // sUSDC per 1 jUSDC
    jusdcPerSusdc,   // jUSDC per 1 sUSDC (reciprocal)
    // displays
    display,               // “1/<rate>” style, matching your senior UI if desired
    displaySusdcPerJusdc,  // explicit label (sUSDC per jUSDC)
    displayJusdcPerSusdc,  // explicit label (jUSDC per sUSDC)
    // state
    loading,
    refresh: read,
  }
}
