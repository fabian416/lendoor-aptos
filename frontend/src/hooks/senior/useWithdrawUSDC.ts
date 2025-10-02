'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { DECIMALS, parseUnitsAptos } from '@/lib/utils'
import { useSeniorAvailableToWithdraw } from '@/hooks/senior/useSeniorAvailableToWithdraw'
import { useUserJourney } from '@/providers/UserJourneyProvider'
import { LENDOOR_CONTRACT, WUSDC_TYPE } from '@/lib/constants'

type SubmitFn = (amountInput: string, profileName?: string) => Promise<true | void>

// Minimal, readable error message extractor
const errMsg = (e: any) => e?.shortMessage || e?.reason || e?.message || 'Transaction failed'

// Encode vector<u8> for Move
const utf8Bytes = (s: string) => new TextEncoder().encode(s)

export function useWithdrawUSDC(): {
  submit: SubmitFn
  submitting: boolean
  availableUi: number
} {
  const { aptos } = useAptos()
  const { account, signAndSubmitTransaction } = useWallet()
  const { value, updateJourney } = useUserJourney()

  // Reuse the “available to withdraw” query (no polling here — we’ll refresh after tx)
  const {
    uiAmount: availableUi = 0,
    refresh: refreshAvailable,
  } = useSeniorAvailableToWithdraw({ pollMs: 0 })

  const [submitting, setSubmitting] = React.useState(false)

  const submit = React.useCallback<SubmitFn>(
    async (amountInput, profileName = 'main') => {
      const amtStr = amountInput?.trim()
      if (!amtStr) return

      if (!account?.address) {
        toast.error('Connect a wallet', { description: 'No account connected.' })
        return
      }

      // Validate UI amount and compare against available (same UI scale: DECIMALS)
      const want = Number(amtStr)
      if (!Number.isFinite(want) || want <= 0) {
        toast.error('Invalid amount')
        return
      }
     

      setSubmitting(true)
      try {
        // Convert UI → on-chain base units (u64)
        const assets = parseUnitsAptos(amtStr, DECIMALS)

        // Call Move entry:
        // controller::withdraw_fa<WUSDC>(profile_name: vector<u8>, amount: u64, allow_borrow: bool)
        // We set allow_borrow = false to avoid turning the operation into a loan.
        const pending = await signAndSubmitTransaction({
          data: {
            function: `${LENDOOR_CONTRACT}::controller::withdraw_fa`,
            typeArguments: [WUSDC_TYPE],
            functionArguments: [utf8Bytes(profileName), assets, false],
          },
        })

        // Wait for finality
        await aptos.waitForTransaction({ transactionHash: pending.hash })

        toast.success('Withdraw confirmed')

        // Refresh derived views after success
        await refreshAvailable()

        // Advance the user journey if applicable
        if (value === 'withdraw_usdc') {
          await updateJourney('borrow')
        }

        return true
      } catch (e: any) {
        toast.error('Withdraw failed', { description: errMsg(e) })
      } finally {
        setSubmitting(false)
      }
    },
    [account?.address, signAndSubmitTransaction, aptos, availableUi, refreshAvailable, value, updateJourney],
  )

  return { submit, submitting, availableUi }
}
