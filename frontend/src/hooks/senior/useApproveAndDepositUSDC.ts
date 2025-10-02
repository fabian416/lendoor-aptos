'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import {
  LENDOOR_CONTRACT,
  WUSDC_DECIMALS as DECIMALS,
  WUSDC_TYPE,
  FA_METADATA_OBJECT,
} from '@/lib/constants'
import { parseUnitsAptos, formatUSDCAmount2dp } from '@/lib/utils'
import { useUserJourney } from '@/providers/UserJourneyProvider'

// Minimal, readable message extractor
const msg = (e: any) =>
  e?.shortMessage || e?.reason || e?.message || 'Transaction failed'

// Accept AccountAddress|string since the SDK supports both
async function readFaBalance(
  aptos: any,
  addr: string | { toString: () => string },
  metadataAddr: string,
): Promise<bigint | null> {
  try {
    const list = await aptos.getAccountFungibleAssetBalances({
      accountAddress: addr as any, // SDK takes AccountAddressInput
    })
    const hit =
      list?.find(
        (b: any) =>
          b?.asset?.metadata_address === metadataAddr ||
          b?.asset?.metadata?.address === metadataAddr ||
          b?.metadata_address === metadataAddr,
      ) ?? null
    if (hit?.amount != null) return BigInt(hit.amount)
  } catch { /* ignore and fallback to on-chain-only path */ }
  return null
}

// Encode vector<u8> for Move
const utf8Bytes = (s: string) => new TextEncoder().encode(s)

export function useApproveAndDepositUSDC() {
  const { aptos } = useAptos()
  const { account, signAndSubmitTransaction } = useWallet()
  const connectedAddress = account?.address // AccountAddress (SDK) – OK for SDK calls
  const { value, updateJourney } = useUserJourney()
  const [submitting, setSubmitting] = React.useState(false)

  const submit = React.useCallback(
    async (amountInput: string, profileName: string = 'main') => {
      if (!amountInput?.trim()) return
      if (!connectedAddress) {
        toast.error('Connect a wallet', { description: 'No account connected.' })
        return
      }

      setSubmitting(true)
      try {
        const assets = parseUnitsAptos(amountInput.trim(), DECIMALS)
        if (assets <= 0n) {
          toast.error('Invalid amount', { description: 'Enter a positive value.' })
          return
        }

        // Optional: readiness check
        try {
          const [ready] = await aptos.view<boolean[]>({
            payload: {
              function: `${LENDOOR_CONTRACT}::fa_to_coin_wrapper::is_ready`,
              typeArguments: [WUSDC_TYPE],
              functionArguments: [],
            },
          })
          if (!ready) {
            toast.error('Wrapper not ready', {
              description: 'FA wrapper is not initialized for this asset.',
            })
            return
          }
        } catch { /* tolerate indexer/view flakiness */ }

        // Optional UX: pre-check FA balance from indexer
        const maybeBal = await readFaBalance(aptos, connectedAddress, FA_METADATA_OBJECT)
        if (maybeBal != null && maybeBal < assets) {
          toast.error('Insufficient balance', {
            description: `You have ${formatUSDCAmount2dp(maybeBal)} and need ${formatUSDCAmount2dp(assets)}.`,
          })
          return
        }

        // Single on-chain call: deposit_fa wraps FA → Coin and deposits
        try {
          const pending = await signAndSubmitTransaction({
            data: {
              function: `${LENDOOR_CONTRACT}::controller::deposit_fa`,
              typeArguments: [WUSDC_TYPE],
              functionArguments: [utf8Bytes(profileName), assets],
            },
          })
          await aptos.waitForTransaction({ transactionHash: pending.hash })
          toast.success('Deposit confirmed')
        } catch (e: any) {
          toast.error('Deposit failed', { description: msg(e) })
          throw e
        }

        if (value === 'deposit_usdc') {
          await updateJourney('deposit_susdc')
        }
        return true
      } finally {
        setSubmitting(false)
      }
    },
    [aptos, signAndSubmitTransaction, connectedAddress, value, updateJourney],
  )

  return { submit, submitting }
}
