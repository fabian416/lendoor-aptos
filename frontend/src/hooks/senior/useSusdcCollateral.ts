'use client'

import * as React from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { useAptos } from '@/providers/WalletProvider'
import { LENDOOR_CONTRACT, WUSDC_TYPE } from '@/lib/constants'
import { formatUSDCAmount2dp, toBigIntLoose } from '@/lib/utils'

/**
 * Deposited sUSDC (LP) collateral in the reserve (off-wallet).
 * Reads via views:
 *   - profile::is_registered(address) -> bool
 *   - profile::profile_deposit<WUSDC>(address) -> (lp_amount: u64, underlying_amount: u64)
 * Notes:
 * - If the user has no Profile, treat as zero.
 * - This is the amount being used as collateral (not in the wallet).
 */
export function useSusdcCollateral(pollMs = 15_000) {
  const { aptos } = useAptos()
  const { account } = useWallet()

  const [lpRaw, setLpRaw] = React.useState<bigint | null>(null)
  const [underlyingRaw, setUnderlyingRaw] = React.useState<bigint | null>(null)
  const [lpDisplay, setLpDisplay] = React.useState('—')
  const [underlyingDisplay, setUnderlyingDisplay] = React.useState('—')
  const [loading, setLoading] = React.useState(false)

  const read = React.useCallback(async () => {
    const addr = account?.address?.toString?.() ?? String(account?.address ?? '')
    if (!addr) { 
      setLpRaw(null); setUnderlyingRaw(null)
      setLpDisplay('—'); setUnderlyingDisplay('—')
      return
    }
    setLoading(true)
    try {
      // Check if the profile exists to avoid aborts.
      const isRegOut = await aptos.view({
        payload: {
          function: `${LENDOOR_CONTRACT}::profile::is_registered`,
          typeArguments: [],
          functionArguments: [addr],
        },
      })
      const isRegistered = Boolean(isRegOut?.[0])
      if (!isRegistered) {
        setLpRaw(0n); setUnderlyingRaw(0n)
        setLpDisplay('0.00'); setUnderlyingDisplay('0.00')
        return
      }

      const out = await aptos.view({
        payload: {
          function: `${LENDOOR_CONTRACT}::profile::profile_deposit`,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [addr],
        },
      })
      const lpAmt = toBigIntLoose(String(out?.[0] ?? '0'))
      const underlyingAmt = toBigIntLoose(String(out?.[1] ?? '0'))

      setLpRaw(lpAmt)
      setUnderlyingRaw(underlyingAmt)
      setLpDisplay(formatUSDCAmount2dp(lpAmt))
      setUnderlyingDisplay(formatUSDCAmount2dp(underlyingAmt))
    } catch {
      // Keep previous UI on errors (network/indexer hiccups)
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

  return {
    lpRaw,                // LP tokens deposited as collateral
    underlyingRaw,        // underlying equivalent (u64)
    lpDisplay,            // formatted LP amount (same decimals as USDC)
    underlyingDisplay,    // formatted underlying amount
    loading,
    refresh: read,
  }
}
