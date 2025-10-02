'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import {
  LENDOOR_CONTRACT,
  WUSDC_TYPE,
  FA_METADATA_OBJECT,
} from '@/lib/constants'
import {
  DECIMALS,
  parseUnitsAptos,
  formatUSDCAmount2dp,
} from '@/lib/utils'
import type { FQName } from '@/types/aptos'

/** Compact error message extractor */
const msg = (e: any) => e?.shortMessage || e?.reason || e?.message || 'Transaction failed'

/** Read FA balance via indexer; returns bigint or null if unavailable */
async function readFaBalance(aptos: any, addr: string, metadataAddr: string): Promise<bigint | null> {
  try {
    const balances = await aptos.getAccountFungibleAssetBalances({ accountAddress: addr })
    const hit =
      balances?.find(
        (b: any) =>
          b?.asset?.metadata_address === metadataAddr ||
          b?.asset?.metadata?.address === metadataAddr ||
          b?.metadata_address === metadataAddr,
      ) ?? null
    if (hit?.amount != null) return BigInt(hit.amount)
  } catch { /* tolerate indexer hiccups */ }
  return null
}

// controller::repay_fa<Coin>(profile_name: vector<u8>, amount: u64)
const FN_REPAY_FA = `${LENDOOR_CONTRACT}::controller::repay_fa` as FQName

/** Repay USDC-denominated debt using FA (no ERC20 allowance model on Aptos) */
export function useRepay() {
  const { aptos } = useAptos()
  const { account, signAndSubmitTransaction } = useWallet()
  const [submitting, setSubmitting] = React.useState(false)

  // Encode vector<u8> for Move
  const utf8Bytes = React.useMemo(() => new TextEncoder(), []).encode.bind(new TextEncoder())

  const submit = React.useCallback(
    async (amountInput: string, profileName: string = 'main') => {
      const raw = amountInput?.trim()
      if (!raw) {
        toast.error('Enter an amount.')
        return false
      }
      const addr = account?.address?.toString()
      if (!addr) {
        toast.error('Connect a wallet', { description: 'No account connected.' })
        return false
      }

      // Parse UI → base units (u64)
      let amount: bigint
      try {
        amount = parseUnitsAptos(raw, DECIMALS)
        if (amount <= 0n) {
          toast.error('Amount must be greater than 0.')
          return false
        }
      } catch {
        toast.error('Invalid amount format.')
        return false
      }

      setSubmitting(true)
      const tLoading = toast.loading('Submitting repayment…')

      try {
        // Optional UX: pre-check FA balance; let tx fail if indexer is unavailable
        const maybeBal = await readFaBalance(aptos, addr, FA_METADATA_OBJECT)
        if (maybeBal != null && maybeBal < amount) {
          toast.dismiss(tLoading)
          toast.error('Insufficient balance', {
            description: `You have ${formatUSDCAmount2dp(maybeBal)} and need ${formatUSDCAmount2dp(amount)}.`,
          })
          return false
        }

        // Single on-chain call
        const pending = await signAndSubmitTransaction({
          data: {
            function: FN_REPAY_FA,
            typeArguments: [WUSDC_TYPE],
            functionArguments: [utf8Bytes(profileName), amount],
          },
        })
        await aptos.waitForTransaction({ transactionHash: pending.hash })

        toast.dismiss(tLoading)
        toast.success('Repayment confirmed', {
          description: 'Your outstanding balance has been reduced.',
        })
        return true
      } catch (e: any) {
        toast.dismiss(tLoading)
        toast.error('Repay failed', { description: msg(e) })
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [account?.address, signAndSubmitTransaction, aptos],
  )

  return { submit, submitting }
}
