'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import {
  LENDOOR_CONTRACT,
  WUSDC_DECIMALS as DECIMALS,
  WUSDC_TYPE,
} from '@/lib/constants'
import { parseUnitsAptos, formatUSDCAmount2dp, toBigIntLoose } from '@/lib/utils'
import { useUserJourney } from '@/providers/UserJourneyProvider'

// Minimal, readable message extractor
const msg = (e: any) =>
  e?.shortMessage || e?.reason || e?.message || 'Transaction failed'

// vector<u8> helper
const utf8Bytes = (s: string) => new TextEncoder().encode(s)

/** Read user's senior LP balance (LP shares) from profile::profile_deposit<Coin>(owner). */
async function readSeniorLpBalance(aptos: any, owner: string | { toString: () => string }): Promise<bigint> {
  const ownerStr = typeof owner === 'string' ? owner : owner.toString()
  const out = await aptos.view({
    payload: {
      function: `${LENDOOR_CONTRACT}::profile::profile_deposit`,
      typeArguments: [WUSDC_TYPE],
      functionArguments: [ownerStr],
    },
  })
  const tup = out?.[0]
  if (Array.isArray(tup) && tup.length >= 1) return toBigIntLoose(tup[0]) // [lp, underlying]
  if (tup && typeof tup === 'object' && 0 in (tup as any)) return toBigIntLoose((tup as any)[0])
  return 0n
}

/** Try multiple entrypoints for “deposit s-shares into junior wrapper”. */
async function tryDepositSIntoJunior(
  signAndSubmitTransaction: any,
  aptos: any,
  amount: bigint,
  profileName: string,
) {
  const withProfile = [
    `${LENDOOR_CONTRACT}::controller::deposit_senior_to_junior`,
    `${LENDOOR_CONTRACT}::controller::promote_to_junior`,
  ]
  for (const fn of withProfile) {
    try {
      const pending = await signAndSubmitTransaction({
        data: {
          function: fn,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [utf8Bytes(profileName), amount],
        },
      })
      await aptos.waitForTransaction({ transactionHash: pending.hash })
      return true
    } catch {}
  }

  const withoutProfile = [
    `${LENDOOR_CONTRACT}::junior::deposit_s`,
    `${LENDOOR_CONTRACT}::junior::deposit_senior_shares`,
    `${LENDOOR_CONTRACT}::junior::deposit`,
    `${LENDOOR_CONTRACT}::junior::promote_from_senior`,
  ]
  for (const fn of withoutProfile) {
    try {
      const pending = await signAndSubmitTransaction({
        data: {
          function: fn,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [amount],
        },
      })
      await aptos.waitForTransaction({ transactionHash: pending.hash })
      return true
    } catch {}
  }
  throw new Error('No junior deposit entrypoint succeeded')
}

/**
 * Move version of “approve + deposit sUSDC into junior”.
 * In Move there is no approve/allowance step; it’s a single entry call.
 */
export function useApproveAndDepositSUSDC() {
  const { aptos } = useAptos()
  const { account, signAndSubmitTransaction } = useWallet()
  const { value, updateJourney } = useUserJourney()

  const [submitting, setSubmitting] = React.useState(false)

  const submit = React.useCallback(
    async (amountInput: string, profileName: string = 'main') => {
      if (!amountInput?.trim()) return false
      if (!account?.address) {
        toast.error('Connect a wallet', { description: 'No account connected.' })
        return false
      }

      setSubmitting(true)
      try {
        // Parse UI → base units (shares use same decimals as the wrapped FA)
        const sharesWanted = parseUnitsAptos(amountInput.trim(), DECIMALS)
        if (sharesWanted <= 0n) {
          toast.error('Invalid amount', { description: 'Enter a positive value.' })
          return false
        }

        // Balance check (senior LP shares currently held)
        const sBal = await readSeniorLpBalance(aptos, account.address)
        if (sBal < sharesWanted) {
          toast.error('Insufficient sUSDC', {
            description: `You have ${formatUSDCAmount2dp(sBal)} sUSDC and need ${formatUSDCAmount2dp(sharesWanted)}.`,
          })
          return false
        }

        // Single on-chain call: move s-shares → junior (mint j-shares)
        try {
          await tryDepositSIntoJunior(signAndSubmitTransaction, aptos, sharesWanted, profileName)
          toast.success('Deposit confirmed')
        } catch (e: any) {
          toast.error('Deposit failed', { description: msg(e) })
          throw e
        }

        // Advance the funnel to the next step, mirroring your EVM flow
        if (value === 'deposit_susdc') {
          await updateJourney('withdraw_susdc')
        }
        return true
      } finally {
        setSubmitting(false)
      }
    },
    [aptos, account?.address, signAndSubmitTransaction, value, updateJourney],
  )

  return { submit, submitting }
}
